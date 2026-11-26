const SUPABASE_URL = "VOTRE_URL_SUPABASE"; // https://xxxx.supabase.co
const SUPABASE_KEY = "VOTRE_CLE_PUBLIQUE_SUPABASE";
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

const authScreen = document.querySelector("#authScreen");
const authForm = document.querySelector("#authForm");
const usernameInput = document.querySelector("#usernameInput");
const signupCountry = document.querySelector("#signupCountry");
const profileButton = document.querySelector("#profileButton");
const remoteName = document.querySelector("#remoteName");
const remoteInfo = document.querySelector("#remoteInfo");
const remoteAvatar = document.querySelector("#remoteAvatar");
const remoteVideo = document.querySelector("#remoteVideo");
const remoteStatus = document.querySelector("#remoteStatus");
const matchState = document.querySelector("#matchState");
const onlineCount = document.querySelector("#onlineCount");
const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const nextButton = document.querySelector("#nextButton");
const reportButton = document.querySelector("#reportButton");
const countryFilter = document.querySelector("#countryFilter");
const localVideo = document.querySelector("#localVideo");
const cameraFallback = document.querySelector("#cameraFallback");
const cameraStatus = document.querySelector("#cameraStatus");
const micButton = document.querySelector("#micButton");
const cameraButton = document.querySelector("#cameraButton");

let currentUser = loadUser();
let activeMatch = null;
let searching = false;
let stream = null;
let micEnabled = false;
let cameraEnabled = false;
let matchChannels = [];
let messageChannel = null;
let signalChannel = null;
let peerConnection = null;
let makingOffer = false;
let manualOfferInProgress = false;
let soundUnlocked = false;

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem("charh_user"));
  } catch {
    return null;
  }
}

function saveUser(user) {
  localStorage.setItem("charh_user", JSON.stringify(user));
}

function userInitial(name) {
  return (name || "U").trim().charAt(0).toUpperCase();
}

function addMessage(text, type = "remote") {
  const node = document.createElement("div");
  node.className = `message ${type}`;
  node.textContent = text;
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
}

function canUseMediaDevices() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

function microphoneErrorMessage(error) {
  if (!window.isSecureContext) {
    return "Le micro ne peut fonctionner que sur un site en HTTPS. Ouvre le site avec https:// puis réessaie.";
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return "Ce navigateur ne permet pas l’accès au micro. Essaie avec Chrome, Safari ou Firefox à jour.";
  }

  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Autorise le micro dans ton navigateur, puis appuie sur MIC pour réessayer.";
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "Aucun micro détecté sur cet appareil.";
  }

  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "Le micro est déjà utilisé par une autre application. Ferme-la puis réessaie.";
  }

  return "Le micro n’a pas démarré. Vérifie l’autorisation du navigateur puis appuie sur MIC.";
}

function showMicrophoneRequired(message = "Active le micro pour commencer une rencontre.") {
  updateLocalMediaUI(message);
  addMessage(message, "system");
  matchState.textContent = "Micro requis";
  remoteStatus.textContent = "Micro requis";
  nextButton.disabled = false;
}

function setRemoteWaiting(text = "Recherche d’un vrai utilisateur") {
  stopPeerConnection();
  remoteName.textContent = "En attente";
  remoteInfo.textContent = text;
  remoteAvatar.textContent = "?";
  remoteAvatar.style.display = "grid";
  remoteVideo.classList.remove("is-live");
  remoteVideo.srcObject = null;
  remoteStatus.textContent = searching ? "Recherche" : "Libre";
}

async function showMatch(match) {
  activeMatch = match;
  searching = false;
  remoteName.textContent = match.username || "Utilisateur";
  remoteInfo.textContent = match.country || countryFilter.value;
  remoteAvatar.textContent = userInitial(match.username);
  remoteStatus.textContent = "Live";
  matchState.textContent = "Connecté";
  nextButton.disabled = false;
  messages.innerHTML = "";
  addMessage(`${remoteName.textContent} est connecté.`, "system");
  subscribeToMessages(match.id);
  await startPeerConnection(match);
}

async function connectNext() {
  if (!currentUser) {
    showAuth();
    return;
  }

  const microphoneReady = await startMicrophone();
  if (!microphoneReady) {
    showMicrophoneRequired(cameraStatus.textContent);
    return;
  }

  activeMatch = null;
  searching = true;
  matchState.textContent = "Recherche";
  messages.innerHTML = "";
  addMessage("Recherche d’un vrai utilisateur connecté...", "system");
  setRemoteWaiting("Recherche en cours...");
  nextButton.disabled = true;

  await upsertProfile();
  const match = await requestMatch();

  if (match) {
    showMatch(match);
    return;
  }

  matchState.textContent = "En attente";
  addMessage("Tu es dans la file d’attente. Dès qu’une vraie personne arrive, le match démarre.", "system");
  subscribeToIncomingMatches();
}

async function startCamera() {
  if (!canUseMediaDevices()) {
    cameraStatus.textContent = microphoneErrorMessage();
    return;
  }

  await startMicrophone();
  await startVideo();
}

async function startMicrophone() {
  if (!canUseMediaDevices()) {
    cameraStatus.textContent = microphoneErrorMessage();
    updateLocalMediaUI();
    return false;
  }

  if (!stream) {
    stream = new MediaStream();
  }

  if (stream.getAudioTracks().length) {
    micEnabled = true;
    updateLocalMediaUI();
    return true;
  }

  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    audioStream.getAudioTracks().forEach((track) => {
      stream.addTrack(track);
      addTrackToPeer(track);
    });
    micEnabled = true;
    localVideo.srcObject = stream;
    updateLocalMediaUI();
    return true;
  } catch (error) {
    micEnabled = false;
    updateLocalMediaUI(microphoneErrorMessage(error));
    return false;
  }
}

async function startVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "Caméra indisponible";
    updateLocalMediaUI();
    return false;
  }

  if (!stream) {
    stream = new MediaStream();
  }

  if (stream.getVideoTracks().length) {
    cameraEnabled = true;
    updateLocalMediaUI();
    return true;
  }

  try {
    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user"
      }
    });
    videoStream.getVideoTracks().forEach((track) => {
      stream.addTrack(track);
      addTrackToPeer(track);
    });
    cameraEnabled = true;
    localVideo.srcObject = stream;
    updateLocalMediaUI();
    return true;
  } catch {
    cameraEnabled = false;
    updateLocalMediaUI("Caméra refusée, micro seul actif");
    return false;
  }
}

function stopMicrophone() {
  if (!stream) return;

  stream.getAudioTracks().forEach((track) => {
    track.stop();
    stream.removeTrack(track);
  });
  micEnabled = false;
  updateLocalMediaUI();
  stopPeerConnection();
}

function stopVideo() {
  if (!stream) return;

  stream.getVideoTracks().forEach((track) => {
    track.stop();
    stream.removeTrack(track);
  });
  cameraEnabled = false;
  updateLocalMediaUI();
}

function updateLocalMediaUI(customStatus) {
  const hasAudio = Boolean(stream?.getAudioTracks().length);
  const hasVideo = Boolean(stream?.getVideoTracks().length);

  micEnabled = hasAudio;
  cameraEnabled = hasVideo;
  localVideo.srcObject = stream;
  cameraFallback.style.display = hasVideo ? "none" : "grid";
  micButton.setAttribute("aria-pressed", String(hasAudio));
  cameraButton.setAttribute("aria-pressed", String(hasVideo));
  document.body.classList.toggle("has-mic", hasAudio);

  if (customStatus) {
    cameraStatus.textContent = customStatus;
  } else if (hasAudio && hasVideo) {
    cameraStatus.textContent = "Micro actif, caméra active";
  } else if (hasAudio) {
    cameraStatus.textContent = "Micro actif, caméra optionnelle";
  } else {
    cameraStatus.textContent = "Autorise le micro pour l’appel";
  }

  if (!hasAudio && !hasVideo) {
    stream = null;
    localVideo.srcObject = null;
  }
}

function addTrackToPeer(track) {
  if (!peerConnection || !stream) return;

  const alreadySent = peerConnection.getSenders().some((sender) => sender.track === track);
  if (!alreadySent) {
    peerConnection.addTrack(track, stream);
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();

  if (!text) return;
  if (!currentUser) {
    showAuth();
    return;
  }
  if (!activeMatch) {
    addMessage("Attends d’être connecté avec quelqu’un avant d’envoyer un message.", "system");
    return;
  }

  addMessage(text, "local");
  messageInput.value = "";
  await sendMessage(text);
});

nextButton.addEventListener("click", connectNext);

reportButton.addEventListener("click", () => {
  addMessage("Signalement envoyé. Tu peux passer à la personne suivante.", "system");
});

const chatToggle = document.querySelector("#chatToggle");
const chatClose = document.querySelector("#chatClose");

chatToggle?.addEventListener("click", () => {
  document.body.classList.add("chat-open");
});

chatClose?.addEventListener("click", () => {
  document.body.classList.remove("chat-open");
});

micButton.addEventListener("click", () => {
  if (micEnabled) {
    addMessage("Micro actif. Il reste obligatoire pour discuter en direct.", "system");
  } else {
    startMicrophone();
  }
});

cameraButton.addEventListener("click", async () => {
  if (cameraEnabled) {
    stopVideo();
  } else {
    await startVideo();
  }
});

document.addEventListener("click", unlockRemoteSound, { once: true });

countryFilter.addEventListener("change", connectNext);

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  currentUser = {
    id: currentUser?.id || crypto.randomUUID(),
    username: usernameInput.value.trim(),
    country: signupCountry.value,
    createdAt: currentUser?.createdAt || new Date().toISOString()
  };
  saveUser(currentUser);
  applyUser();
  const microphoneReady = await startMicrophone();
  if (!microphoneReady) {
    showMicrophoneRequired(cameraStatus.textContent);
    return;
  }
  await upsertProfile();
  connectNext();
});

profileButton.addEventListener("click", async () => {
  await setOffline();
  localStorage.removeItem("charh_user");
  currentUser = null;
  activeMatch = null;
  clearRealtime();
  showAuth();
  setRemoteWaiting();
  messages.innerHTML = "";
  addMessage("Crée ton compte, puis lance une recherche.", "system");
});

window.addEventListener("beforeunload", () => {
  setOffline();
});

function showAuth() {
  authScreen.hidden = false;
  authScreen.classList.remove("is-hidden");
}

function hideAuth() {
  authScreen.classList.add("is-hidden");
  window.setTimeout(() => {
    authScreen.hidden = true;
  }, 180);
}

function applyUser() {
  if (!currentUser) {
    showAuth();
    return;
  }

  if (!currentUser.id) {
    currentUser.id = crypto.randomUUID();
    saveUser(currentUser);
  }

  usernameInput.value = currentUser.username;
  signupCountry.value = currentUser.country;
  countryFilter.value = currentUser.country;
  profileButton.textContent = currentUser.username;
  hideAuth();
}

async function upsertProfile() {
  if (!db || !currentUser) return;

  await db.from("profiles").upsert({
    id: currentUser.id,
    username: currentUser.username,
    country: currentUser.country,
    is_online: true,
    last_seen: new Date().toISOString()
  });
}

async function setOffline() {
  if (!db || !currentUser) return;

  await db.from("waiting_queue").delete().eq("user_id", currentUser.id);
  await db.from("profiles").update({
    is_online: false,
    last_seen: new Date().toISOString()
  }).eq("id", currentUser.id);
}

async function requestMatch() {
  if (!db || !currentUser) return null;

  const staleDate = new Date(Date.now() - 60_000).toISOString();
  await db.from("waiting_queue").delete().lt("created_at", staleDate);
  await db.from("waiting_queue").delete().eq("user_id", currentUser.id);

  let query = db
    .from("waiting_queue")
    .select("user_id,country,profiles:user_id(username,country)")
    .neq("user_id", currentUser.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (countryFilter.value !== "Monde") {
    query = query.eq("country", countryFilter.value);
  }

  const { data: waitingUsers } = await query;
  const candidate = waitingUsers?.[0];

  if (candidate) {
    const matchId = crypto.randomUUID();
    await db.from("matches").insert({
      id: matchId,
      user_a: currentUser.id,
      user_b: candidate.user_id,
      country: countryFilter.value,
      status: "active"
    });
    await db.from("waiting_queue").delete().in("user_id", [currentUser.id, candidate.user_id]);

    return {
      id: matchId,
      userId: candidate.user_id,
      username: candidate.profiles?.username,
      country: candidate.profiles?.country || candidate.country,
      isCaller: true
    };
  }

  await db.from("waiting_queue").upsert({
    user_id: currentUser.id,
    country: countryFilter.value,
    created_at: new Date().toISOString()
  });

  return null;
}

function clearRealtime() {
  matchChannels.forEach((channel) => db?.removeChannel(channel));
  matchChannels = [];

  if (messageChannel) {
    db?.removeChannel(messageChannel);
    messageChannel = null;
  }

  if (signalChannel) {
    db?.removeChannel(signalChannel);
    signalChannel = null;
  }

  stopPeerConnection();
}

function subscribeToIncomingMatches() {
  if (!db || !currentUser) return;

  matchChannels.forEach((channel) => db.removeChannel(channel));
  matchChannels = ["user_a", "user_b"].map((field) => {
    return db.channel(`match-${field}-${currentUser.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "matches",
        filter: `${field}=eq.${currentUser.id}`
      }, async (payload) => {
        const match = payload.new;
        const partnerId = match.user_a === currentUser.id ? match.user_b : match.user_a;
        const partner = await getProfile(partnerId);
        showMatch({
          id: match.id,
          userId: partnerId,
          username: partner?.username || "Utilisateur",
          country: partner?.country || match.country,
          isCaller: match.user_a === currentUser.id
        });
      })
      .subscribe();
  });
}

async function getProfile(userId) {
  if (!db) return null;

  const { data } = await db
    .from("profiles")
    .select("id,username,country")
    .eq("id", userId)
    .single();

  return data;
}

function subscribeToMessages(matchId) {
  if (!db || !currentUser) return;

  if (messageChannel) {
    db.removeChannel(messageChannel);
  }

  messageChannel = db.channel(`messages-${matchId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `match_id=eq.${matchId}`
    }, (payload) => {
      if (payload.new.sender_id !== currentUser.id) {
        addMessage(payload.new.text, "remote");
      }
    })
    .subscribe();
}

async function startPeerConnection(match) {
  if (!db || !currentUser) return;

  if (!stream?.getAudioTracks().length) {
    await startMicrophone();
  }

  if (!stream?.getAudioTracks().length) {
    showMicrophoneRequired(cameraStatus.textContent);
    return;
  }

  stopPeerConnection();

  manualOfferInProgress = Boolean(match.isCaller);

  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  peerConnection.addEventListener("track", (event) => {
    const [remoteStream] = event.streams;
    remoteVideo.srcObject = remoteStream;
    remoteVideo.muted = false;
    remoteVideo.volume = 1;
    if (remoteStream.getVideoTracks().length) {
      remoteVideo.classList.add("is-live");
      remoteAvatar.style.display = "none";
      remoteStatus.textContent = "Live";
    } else {
      remoteVideo.classList.remove("is-live");
      remoteAvatar.style.display = "grid";
      remoteStatus.textContent = "Audio";
    }
    playRemoteVideo();
  });

  peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      sendSignal(match.id, "ice", event.candidate.toJSON());
    }
  });

  peerConnection.addEventListener("negotiationneeded", async () => {
    if (!peerConnection || !activeMatch) return;
    if (manualOfferInProgress) return;
    if (!peerConnection.remoteDescription && !activeMatch.isCaller) return;

    try {
      makingOffer = true;
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);
      await sendSignal(activeMatch.id, "offer", offer);
    } finally {
      makingOffer = false;
    }
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    if (!peerConnection) return;

    if (peerConnection.connectionState === "connected") {
      remoteStatus.textContent = "Live";
    }

    if (["failed", "disconnected"].includes(peerConnection.connectionState)) {
      remoteStatus.textContent = "Reconnexion";
    }
  });

  subscribeToSignals(match.id);
  await loadExistingSignals(match.id);

  if (match.isCaller) {
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);
      await sendSignal(match.id, "offer", offer);
    } finally {
      manualOfferInProgress = false;
    }
  }
}

function stopPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (remoteVideo) {
    remoteVideo.classList.remove("is-live");
    remoteVideo.srcObject = null;
  }

  if (remoteAvatar) {
    remoteAvatar.style.display = "grid";
  }
}

async function unlockRemoteSound() {
  soundUnlocked = true;
  await playRemoteVideo();
}

async function playRemoteVideo() {
  if (!remoteVideo.srcObject) return;

  try {
    await remoteVideo.play();
  } catch {
    if (soundUnlocked) {
      addMessage("Appuie une fois sur la vidéo pour activer le son.", "system");
    }
  }
}

function subscribeToSignals(matchId) {
  if (!db || !currentUser) return;

  if (signalChannel) {
    db.removeChannel(signalChannel);
  }

  signalChannel = db.channel(`signals-${matchId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "webrtc_signals",
      filter: `match_id=eq.${matchId}`
    }, async (payload) => {
      const signal = payload.new;

      if (signal.sender_id === currentUser.id) return;
      await handleSignal(signal);
    })
    .subscribe();
}

async function loadExistingSignals(matchId) {
  if (!db || !currentUser) return;

  const { data } = await db
    .from("webrtc_signals")
    .select("sender_id,type,payload,created_at")
    .eq("match_id", matchId)
    .neq("sender_id", currentUser.id)
    .order("created_at", { ascending: true });

  for (const signal of data || []) {
    await handleSignal(signal);
  }
}

async function sendSignal(matchId, type, payload) {
  if (!db || !currentUser) return;

  await db.from("webrtc_signals").insert({
    match_id: matchId,
    sender_id: currentUser.id,
    type,
    payload
  });
}

async function handleSignal(signal) {
  if (!peerConnection || !activeMatch) return;

  if (signal.type === "offer") {
    if (makingOffer) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await sendSignal(activeMatch.id, "answer", answer);
    return;
  }

  if (signal.type === "answer") {
    if (!peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
    }
    return;
  }

  if (signal.type === "ice") {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
    } catch {
      remoteStatus.textContent = "Connexion";
    }
  }
}

async function sendMessage(text) {
  if (!db || !activeMatch || !currentUser) return;

  const { error } = await db.from("messages").insert({
    match_id: activeMatch.id,
    sender_id: currentUser.id,
    text
  });

  if (error) {
    addMessage("Le message n’a pas pu être envoyé. Réessaie dans un instant.", "system");
  }
}

async function refreshOnlineCount() {
  if (!db) {
    onlineCount.textContent = "Connexion...";
    return;
  }

  await upsertProfile();

  const onlineSince = new Date(Date.now() - 45_000).toISOString();
  const { count, error } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gt("last_seen", onlineSince);

  onlineCount.textContent = error
    ? "Connexion..."
    : `${Number(count || 0).toLocaleString("fr-FR")} en ligne`;
}

setRemoteWaiting();
applyUser();
refreshOnlineCount();
window.setInterval(refreshOnlineCount, 15000);
startMicrophone();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
