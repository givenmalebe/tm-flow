const key = "AIzaSyBkAbesCUmu9hjLzIEhrCgVqm5F-_aeLi8";
for (const email of ["auth-probe-tmflow@example.com","auth-probe-beta-tmflow@example.com"]) {
  const s = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({email, password:"Probe-Pass-12345", returnSecureToken:true})
  }).then(r=>r.json());
  if (!s.idToken) { console.log(email, "-> signin failed:", s.error?.message); continue; }
  const d = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${key}`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ idToken: s.idToken })
  }).then(r=>r.json());
  console.log(email, "->", d.error?.message ?? "deleted");
}
