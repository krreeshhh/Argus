async function askMia(q) {
  const body = new URLSearchParams({
    action: 'sbz_mia_ask_public',
    _wpnonce: SBZ_MIA_PUBLIC.nonce,
    q
  });
  const res = await fetch(SBZ_MIA_PUBLIC.ajax, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
    credentials: 'same-origin',
    body
  });
  const json = await res.json();
  if (!json?.success) throw (json?.data || new Error('Request failed'));
  return json.data;
}

window.askMia = askMia;
  
