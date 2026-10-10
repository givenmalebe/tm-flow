/**
 * The "welcome popout" is shown once per login. The login/register handlers set
 * the flag (sessionStorage so it survives the post-login reload), and the first
 * dashboard mount consumes it.
 */
export const WELCOME_FLAG = "tmflow_show_welcome";

export function markFreshLogin(): void {
  try {
    sessionStorage.setItem(WELCOME_FLAG, "1");
  } catch {
    /* private mode / storage disabled — popout simply won't show */
  }
}

export function consumeFreshLogin(): boolean {
  try {
    const fresh = sessionStorage.getItem(WELCOME_FLAG) === "1";
    if (fresh) sessionStorage.removeItem(WELCOME_FLAG);
    return fresh;
  } catch {
    return false;
  }
}

export function clearFreshLogin(): void {
  try {
    sessionStorage.removeItem(WELCOME_FLAG);
  } catch {
    /* ignore */
  }
}
