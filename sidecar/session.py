"""Authentication + Tidal API session, built on tiddl.core only.

We deliberately avoid tiddl.cli so the engine depends solely on the stable core
package. Auth tokens are stored in the OS keychain (Windows Credential Manager
via `keyring`) — never in plaintext. Only the non-secret HTTP cache lives on
disk under ``~/.tiddl-gui``.
"""

from __future__ import annotations

import json
import time
from datetime import timedelta
from pathlib import Path
from typing import Optional

import keyring
from requests_cache import DO_NOT_CACHE

from tiddl.core.api import ApiError, TidalAPI
from tiddl.core.api.client import TidalClient
from tiddl.core.auth import AuthAPI, AuthClientError

from protocol import emit, log

APP_DIR = Path.home() / ".tiddl-gui"
CACHE_NAME = str(APP_DIR / "http_cache")

# tiddl builds its requests-cache session with the library default of "never
# expire", so the on-disk cache grows without bound and happily serves
# months-old data. Metadata is worth caching briefly (expanding a playlist asks
# for the same album repeatedly), but two things must never be cached: stream
# URLs are signed and short-lived, so a cached one replays from a dead link, and
# search should track the catalogue rather than a snapshot.
CACHE_TTL = 6 * 3600          # seconds to keep ordinary metadata
CACHE_MAX_AGE = timedelta(days=7)   # hard prune, whatever the TTL says
_NEVER_CACHE = ("*playbackinfopostpaywall*", "*/search*")

KEYRING_SERVICE = "Tiddlui"
KEYRING_USER = "tidal-auth"
LEGACY_AUTH_FILE = APP_DIR / "auth.json"  # migrated into the keychain on load


def _tune_cache(session: object) -> None:
    """Give the HTTP cache an expiry policy and prune what has gone stale."""
    try:
        settings = session.settings  # type: ignore[attr-defined]
        settings.expire_after = CACHE_TTL
        settings.cache_control = True  # prefer the server's own headers
        settings.urls_expire_after = {p: DO_NOT_CACHE for p in _NEVER_CACHE}
        cache = session.cache  # type: ignore[attr-defined]
        cache.delete(expired=True, older_than=CACHE_MAX_AGE)
        # Rows written before this policy existed carry "never expire", so the
        # sweeps above can't touch them. Drop anything we now refuse to cache.
        stale = [r.cache_key for r in cache.filter()
                 if any(k in r.url for k in ("playbackinfopostpaywall", "/search"))]
        if stale:
            cache.delete(*stale)
            log(f"dropped {len(stale)} cached entries that must not be reused")
    except Exception as exc:  # noqa: BLE001 — caching is an optimisation, not a requirement
        log(f"http cache tuning skipped: {exc}", level="warning")


class Session:
    def __init__(self) -> None:
        APP_DIR.mkdir(parents=True, exist_ok=True)
        self._auth = self._load()
        self._api: Optional[TidalAPI] = None

    # ---- persistence (OS keychain) ---------------------------------------
    def _load(self) -> dict:
        # One-time migration: move any legacy plaintext file into the keychain.
        if LEGACY_AUTH_FILE.exists():
            try:
                data = json.loads(LEGACY_AUTH_FILE.read_text())
            except (json.JSONDecodeError, OSError):
                data = {}
            self._auth = data
            if data:
                self._save()
            try:
                LEGACY_AUTH_FILE.unlink()
            except OSError:
                pass
            return data
        try:
            raw = keyring.get_password(KEYRING_SERVICE, KEYRING_USER)
            return json.loads(raw) if raw else {}
        except Exception as exc:  # noqa: BLE001
            log(f"keyring load failed: {exc}", level="error")
            return {}

    def _save(self) -> None:
        try:
            keyring.set_password(KEYRING_SERVICE, KEYRING_USER, json.dumps(self._auth))
        except Exception as exc:  # noqa: BLE001
            log(f"keyring save failed: {exc}", level="error")

    @property
    def logged_in(self) -> bool:
        return bool(self._auth.get("token"))

    def emit_status(self) -> None:
        emit(
            "auth_status",
            logged_in=self.logged_in,
            user=self._auth.get("user_name"),
            country_code=self._auth.get("country_code"),
        )

    # ---- token lifecycle -------------------------------------------------
    def _refresh_if_needed(self) -> Optional[str]:
        """Return a fresh access token, refreshing when expired/expiring."""
        refresh_token = self._auth.get("refresh_token")
        if not refresh_token:
            return self._auth.get("token")

        # refresh ~60s before expiry
        if time.time() < self._auth.get("expires_at", 0) - 60:
            return self._auth.get("token")

        try:
            res = AuthAPI().refresh_token(refresh_token)
            self._auth["token"] = res.access_token
            self._auth["expires_at"] = int(time.time()) + res.expires_in
            self._save()
            log("refreshed access token")
            return res.access_token
        except Exception as exc:  # noqa: BLE001
            log(f"token refresh failed: {exc}", level="error")
            return self._auth.get("token")

    def api(self) -> TidalAPI:
        """Return a ready TidalAPI, (re)building it if necessary."""
        if not self.logged_in:
            raise RuntimeError("not logged in")

        token = self._refresh_if_needed()
        if self._api is None:
            client = TidalClient(
                token=token or "",
                cache_name=CACHE_NAME,
                on_token_expiry=self._refresh_if_needed,
            )
            _tune_cache(client.session)
            self._api = TidalAPI(
                client=client,
                user_id=str(self._auth.get("user_id", "")),
                country_code=self._auth.get("country_code", ""),
            )
        else:
            self._api.client.token = token or ""
        return self._api

    # ---- device-flow login (blocking; run in a worker thread) ------------
    def login(self) -> None:
        auth_api = AuthAPI()
        device = auth_api.get_device_auth()
        emit(
            "login_pending",
            verification_url=f"https://{device.verificationUriComplete}",
            user_code=device.userCode,
            expires_in=device.expiresIn,
        )

        deadline = time.time() + device.expiresIn
        while time.time() < deadline:
            time.sleep(device.interval)
            try:
                auth = auth_api.get_auth(device.deviceCode)
            except AuthClientError as exc:
                if exc.error == "authorization_pending":
                    continue
                if exc.error == "expired_token":
                    emit("login_expired")
                    return
                emit("login_error", message=str(exc))
                return

            self._auth = {
                "token": auth.access_token,
                "refresh_token": auth.refresh_token,
                "expires_at": int(time.time()) + auth.expires_in,
                "user_id": str(auth.user_id),
                "country_code": auth.user.countryCode,
                "user_name": auth.user.username,
            }
            self._save()
            self._api = None  # rebuild with new token
            self.emit_status()
            return

        emit("login_expired")

    def logout(self) -> None:
        token = self._auth.get("token")
        if token:
            try:
                AuthAPI().logout_token(token)
            except Exception:  # noqa: BLE001 — best effort
                pass
        # The cache holds account-scoped data (favourites, playlists), so it
        # goes with the session rather than outliving it.
        if self._api is not None:
            try:
                self._api.client.session.cache.clear()
            except Exception:  # noqa: BLE001
                pass
        self._auth = {}
        self._api = None
        try:
            keyring.delete_password(KEYRING_SERVICE, KEYRING_USER)
        except Exception:  # noqa: BLE001 — already absent is fine
            pass
        self.emit_status()


__all__ = ["Session", "ApiError"]
