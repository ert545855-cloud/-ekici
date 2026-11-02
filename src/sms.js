// SMS gönderimi: Netgsm (Türkiye), Twilio veya demo.
// SMS_PROVIDER=netgsm  → NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER (onaylı başlık)
// SMS_PROVIDER=twilio  → TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// Tanımlı değilse demo: SMS gönderilmez, kod sunucu kaydına yazılır (ve demo modunda ekranda gösterilir).
const PROVIDER = (process.env.SMS_PROVIDER || '').toLowerCase();

const configured = () =>
  (PROVIDER === 'netgsm' && process.env.NETGSM_USERCODE && process.env.NETGSM_PASSWORD && process.env.NETGSM_HEADER) ||
  (PROVIDER === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)
    ? PROVIDER
    : null;

// phone: 10 haneli (5xxxxxxxxx)
async function send(phone, message) {
  const p = configured();
  if (!p) {
    console.log(`[SMS demo] 0${phone}: ${message}`);
    return { ok: true, demo: true };
  }
  if (p === 'netgsm') {
    const q = new URLSearchParams({
      usercode: process.env.NETGSM_USERCODE,
      password: process.env.NETGSM_PASSWORD,
      gsmno: '90' + phone,
      message,
      msgheader: process.env.NETGSM_HEADER,
      dil: 'TR',
    });
    const r = await fetch('https://api.netgsm.com.tr/sms/send/get?' + q.toString());
    const t = (await r.text()).trim();
    // Netgsm başarıda "00 <görevId>" (veya 01/02) döner
    if (!/^0[012](\s|$)/.test(t)) throw new Error('SMS gönderilemedi (Netgsm: ' + t.slice(0, 20) + ')');
    return { ok: true };
  }
  if (p === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: '+90' + phone, From: process.env.TWILIO_FROM, Body: message }),
    });
    if (!r.ok) throw new Error('SMS gönderilemedi (Twilio ' + r.status + ')');
    return { ok: true };
  }
}

module.exports = { send, configured };
