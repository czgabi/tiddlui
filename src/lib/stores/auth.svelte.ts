// Authentication state + device-flow login progress.

class AuthStore {
	loggedIn = $state(false);
	user = $state<string | null>(null);
	countryCode = $state<string | null>(null);
	// becomes true once the engine has reported the initial auth state, so the
	// UI doesn't flash the login dialog before we know if a session exists
	checked = $state(false);

	// device-flow login
	pending = $state(false);
	verificationUrl = $state<string | null>(null);
	userCode = $state<string | null>(null);
	expiresIn = $state(0);
	error = $state<string | null>(null);

	setStatus(loggedIn: boolean, user: string | null, country: string | null) {
		this.loggedIn = loggedIn;
		this.user = user;
		this.countryCode = country;
		this.checked = true;
		if (loggedIn) this.reset();
	}

	startPending(url: string, code: string, expiresIn: number) {
		this.pending = true;
		this.verificationUrl = url;
		this.userCode = code;
		this.expiresIn = expiresIn;
		this.error = null;
	}

	reset() {
		this.pending = false;
		this.verificationUrl = null;
		this.userCode = null;
		this.expiresIn = 0;
		this.error = null;
	}
}

export const auth = new AuthStore();
