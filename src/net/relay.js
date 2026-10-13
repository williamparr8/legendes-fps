// Relais publics gratuits (MQTT 3.1.1 sur WebSocket, QoS 0) : secours quand la liaison directe WebRTC échoue (NAT strict, Wi-Fi d'école).
// Le WebSocket sécurisé (port 443/8084/8884/8081) passe presque tous les pare-feu. Aucun serveur à nous : l'hôte et les clients se
// retrouvent sur un sujet propre au code du salon. ATTENTION : les relais sont publics (pas d'authentification) ; le trafic n'est donc
// protégé que par le secret du code de salon. Même interface que les liens PeerJS : { send, close, onmessage, onclose }.
export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://mqtt.eclipseprojects.io:443/mqtt', 'wss://test.mosquitto.org:8081'];
const ROOT = 'legendes-fps/v1/';
const enc = new TextEncoder(), dec = new TextDecoder();
const J = (o) => JSON.stringify(o);
const rid = () => Math.random().toString(36).slice(2, 10);

const rlen = (n) => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; };
const mstr = (s) => { const b = enc.encode(s), o = new Uint8Array(2 + b.length); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; };
function pack(head, parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const L = rlen(n), out = new Uint8Array(1 + L.length + n);
  out[0] = head; out.set(L, 1);
  let o = 1 + L.length;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Client MQTT minimal : connexion (avec testament), abonnement, publication, maintien en vie.
function mqtt(url, id, will, onMsg, onDown) {
  const c = { ready: false, dead: false, onReady: null };
  let buf = new Uint8Array(0), ws = null, ping = 0, last = Date.now();
  const send = (b) => { if (ws && ws.readyState === 1) { try { ws.send(b); } catch (e) { /* perdu */ } } };
  const down = (why) => { if (c.dead) return; c.dead = true; clearInterval(ping); try { ws.close(); } catch (e) { /* fermé */ } if (onDown) onDown(why); };
  c.publish = (topic, str) => send(pack(0x30, [mstr(topic), enc.encode(str)]));
  c.subscribe = (topics) => { const p = [new Uint8Array([0, 1])]; for (const t of topics) p.push(mstr(t), new Uint8Array([0])); send(pack(0x82, p)); };
  c.close = () => { if (c.dead) return; send(new Uint8Array([0xe0, 0])); c.dead = true; clearInterval(ping); setTimeout(() => { try { ws.close(); } catch (e) { /* fermé */ } }, 100); };
  const handle = (type, body) => {
    last = Date.now();
    const t = type >> 4;
    if (t === 2) { if (body.length > 1 && body[1] === 0) { c.ready = true; if (c.onReady) c.onReady(); } else down('refused'); }
    else if (t === 3) {
      const tl = (body[0] << 8) | body[1];
      let o = 2 + tl;
      const topic = dec.decode(body.subarray(2, o));
      if (((type >> 1) & 3) > 0) o += 2;
      try { onMsg(topic, dec.decode(body.subarray(o))); } catch (e) { /* message ignoré */ }
    }
  };
  const feed = (chunk) => {
    const nb = new Uint8Array(buf.length + chunk.length);
    nb.set(buf); nb.set(chunk, buf.length); buf = nb;
    for (;;) {
      if (buf.length < 2) return;
      let mul = 1, len = 0, i = 1, b;
      do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while ((b & 128) && i < 5);
      if (buf.length < i + len) return;
      const type = buf[0], body = buf.slice(i, i + len);
      buf = buf.slice(i + len);
      handle(type, body);
    }
  };
  try { ws = new WebSocket(url, ['mqtt']); } catch (e) { setTimeout(() => down('ws'), 0); return c; }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    const p = [new Uint8Array([0, 4, 77, 81, 84, 84, 4, will ? 0x06 : 0x02, 0, 60]), mstr(id)];
    if (will) { const w = enc.encode(will.payload); p.push(mstr(will.topic), new Uint8Array([w.length >> 8, w.length & 255]), w); }
    send(pack(0x10, p));
    ping = setInterval(() => { send(new Uint8Array([0xc0, 0])); if (Date.now() - last > 90000) down('silence'); }, 20000);
  };
  ws.onmessage = (e) => feed(new Uint8Array(e.data));
  ws.onerror = () => down('error');
  ws.onclose = () => down('closed');
  return c;
}

// Hôte : écoute `code` sur tous les relais à la fois ; chaque client est rattaché au relais d'où est venu son « hello ».
export function relayHost(code, onlink, newLink) {
  return new Promise((resolve, reject) => {
    const hostId = rid(), base = ROOT + code, links = new Map(), conns = [];
    let taken = false, settled = false, probing = false, downs = 0;
    const closeAll = () => {
      for (const c of conns) if (c.ready && !c.dead) c.publish(base + '/all', J({ k: 'hostbye' }));
      for (const l of [...links.values()]) l.link.fire();
      links.clear();
      for (const c of conns) c.close();
    };
    const onmsg = (bi) => (topic, str) => {
      let m;
      try { m = JSON.parse(str); } catch (e) { return; }
      if (topic.endsWith('/all')) {
        if (m.k === 'probe' && m.f !== hostId) conns[bi].publish(base + '/all', J({ k: 'taken', f: hostId }));
        else if (m.k === 'taken' && m.f !== hostId) taken = true;
        return;
      }
      if (m.k === 'hello') {
        if (!m.f || links.has(m.f)) return;
        const cid = m.f, c = conns[bi];
        const link = newLink((o) => c.publish(base + '/c/' + cid, J({ k: 'd', d: o })), () => { c.publish(base + '/c/' + cid, J({ k: 'bye' })); links.delete(cid); });
        links.set(cid, { link, bi });
        c.publish(base + '/c/' + cid, J({ k: 'ack' }));
        onlink(link);
      } else if (m.k === 'd') {
        const e = links.get(m.f);
        if (e && e.link.onmessage) e.link.onmessage(m.d);
      } else if (m.k === 'bye') {
        const e = links.get(m.f);
        if (e) { links.delete(m.f); e.link.fire(); }
      }
    };
    BROKERS.forEach((url, i) => {
      const c = conns[i] = mqtt(url, 'lfps-h-' + hostId + i, { topic: base + '/all', payload: J({ k: 'hostbye' }) }, onmsg(i), () => {
        for (const [cid, e] of [...links]) if (e.bi === i) { links.delete(cid); e.link.fire(); }
        if (++downs === BROKERS.length && !settled) { settled = true; reject({ type: 'network' }); }
      });
      c.onReady = () => {
        c.subscribe([base + '/h', base + '/all']);
        if (probing) return;
        probing = true; // un autre hôte utilise-t-il déjà ce code ? (réponse « taken » dans les 900 ms)
        setTimeout(() => c.publish(base + '/all', J({ k: 'probe', f: hostId })), 300);
        setTimeout(() => {
          if (settled) return;
          settled = true;
          if (taken) { closeAll(); reject({ type: 'unavailable-id' }); } else resolve({ close: closeAll });
        }, 1200);
      };
    });
    setTimeout(() => { if (!settled && !probing) { settled = true; closeAll(); reject({ type: 'network' }); } }, 9000);
  });
}

// Client : se présente sur tous les relais ; le premier qui répond (« ack ») devient le chemin, les autres sont fermés.
export function relayConnect(code, ms, newLink) {
  return new Promise((resolve, reject) => {
    const cid = rid(), base = ROOT + code, conns = [];
    let chosen = -1, done = false, link = null, downs = 0, helloT = 0, readyAt = 0;
    const stop = () => { clearInterval(helloT); clearTimeout(timer); };
    const fail = (type) => { if (done) return; done = true; stop(); for (const c of conns) c.close(); reject({ type }); };
    const timer = setTimeout(() => fail(conns.some((c) => c.ready) ? 'peer-unavailable' : 'network'), ms);
    const onmsg = (bi) => (topic, str) => {
      let m;
      try { m = JSON.parse(str); } catch (e) { return; }
      if (m.k === 'ack' && chosen < 0 && !done) {
        chosen = bi; done = true; stop();
        conns.forEach((c, i) => { if (i !== bi) c.close(); });
        const c = conns[bi];
        link = newLink((o) => c.publish(base + '/h', J({ k: 'd', f: cid, d: o })), () => { c.publish(base + '/h', J({ k: 'bye', f: cid })); c.close(); });
        resolve(link);
      } else if (bi === chosen && link) {
        if (m.k === 'd' && link.onmessage) link.onmessage(m.d);
        else if (m.k === 'bye' || m.k === 'hostbye') { link.fire(); conns[bi].close(); }
      }
    };
    BROKERS.forEach((url, i) => {
      const c = conns[i] = mqtt(url, 'lfps-c-' + cid + i, { topic: base + '/h', payload: J({ k: 'bye', f: cid }) }, onmsg(i), () => {
        if (i === chosen && link) link.fire();
        else if (++downs === BROKERS.length) fail('network');
      });
      c.onReady = () => { if (!readyAt) readyAt = Date.now(); c.subscribe([base + '/c/' + cid, base + '/all']); };
    });
    // sans réponse 4,5 s après la première connexion à un relais : aucun hôte n'écoute ce code
    helloT = setInterval(() => {
      if (readyAt && Date.now() - readyAt > 4500) { fail('peer-unavailable'); return; }
      for (const c of conns) if (c.ready && !c.dead) c.publish(base + '/h', J({ k: 'hello', f: cid }));
    }, 700);
  });
}
