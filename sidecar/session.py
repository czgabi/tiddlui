"""Authentication + Tidal API session, built on tiddl.core only.

We deliberately avoid tiddl.cli so the engine depends solely on the stable core
package. Auth tokens are stored in the OS keychain (Windows Credential Manager
via `keyring`) — never in plaintext. Only the non-secret HTTP cache lives on
disk under ``~/.tiddl-gui``.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

import keyring

from tiddl.core.api import ApiError, TidalAPI
from tiddl.core.api.client import TidalClient
from tiddl.core.auth import AuthAPI, AuthClientError

from protocol import emit, log

APP_DIR = Path.home() / ".tiddl-gui"
CACHE_NAME = str(APP_DIR / "http_cache")

KEYRING_SERVICE = "Tiddlui"
KEYRING_USER = "tidal-auth"
LEGACY_AUTH_FILE = APP_DIR / "auth.json"  # migrated into the keychain on load


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
        self._auth = {}
        self._api = None
        try:
            keyring.delete_password(KEYRING_SERVICE, KEYRING_USER)
        except Exception:  # noqa: BLE001 — already absent is fine
            pass
        self.emit_status()


__all__ = ["Session", "ApiError"]
