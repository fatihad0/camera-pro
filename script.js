function generateShortId() { return Math.random().toString(36).substring(2, 10).toUpperCase(); }

const myCustomId = generateShortId();
const peer = new Peer(myCustomId);

let localStream = null;
let activeCalls = []; 
let targetToReconnect = null; 
let isIntentionallyClosed = false; 
let wakeLock = null; 
let currentQuality = 'SD'; // Default kualitas
let isMicOn = true; // Default Mic kamera

// KUMPULAN IKON SVG (Sesuai Gambar)
const iconMicOn = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/><line x1="8" x2="16" y1="22" y2="22"/></svg>`;
const iconMicOff = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="22" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"></path><path d="M5 10v2a7 7 0 0 0 12 5"></path><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"></path><path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path><line x1="12" y1="19" x2="12" y2="22"></line><line x1="8" y1="22" x2="16" y2="22"></line></svg>`;
const iconSpeakerOff = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="17" y1="9" y2="15"/><line x1="17" x2="23" y1="9" y2="15"/></svg>`;
const iconSpeakerOn = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const iconVideoRecord = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="2" y="5" rx="2" ry="2"/><path d="M16 9l4-3v12l-4-3"/></svg>`;
const iconVideoStop = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="12" height="12" x="6" y="6" rx="2" ry="2"/></svg>`;
const iconCamera = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const iconSD = `<div class="quality-badge">SD</div>`;
const iconHD = `<div class="quality-badge">HD</div>`;


// ==========================================
// 1. SENSOR JARINGAN & AGRESSIVE RECONNECT
// ==========================================
peer.on('disconnected', () => {
    if (!isIntentionallyClosed) {
        console.log("Koneksi server putus. Mencoba reconnect...");
        peer.reconnect();
    }
});

window.addEventListener('online', () => {
    if (!isIntentionallyClosed && targetToReconnect) {
        const statusPengirim = document.getElementById('statusPengirim');
        if(statusPengirim) statusPengirim.innerText = "Sinyal baru terdeteksi! Menyambung ulang...";
        if (peer.disconnected) peer.reconnect();
        setTimeout(() => hubungkanKePenerima(targetToReconnect), 2000);
    }
});

// ==========================================
// 2. REMOTE CONTROL & DATA CHANNEL (KAMERA MENERIMA PERINTAH)
// ==========================================
peer.on('connection', (conn) => {
    conn.on('data', async (data) => {
        if (data.type === 'RECONNECT') {
            if(targetToReconnect && !isIntentionallyClosed) hubungkanKePenerima(targetToReconnect);
        } else if (data.type === 'SWITCH_CAMERA') {
            document.getElementById('kameraSelect').value = data.deviceId;
            await mulaiKamera(data.deviceId);
        } else if (data.type === 'SET_QUALITY') {
            currentQuality = data.quality;
            await mulaiKamera(document.getElementById('kameraSelect').value); // Restart kamera dengan resolusi baru
        } else if (data.type === 'TOGGLE_MIC') {
            if (localStream) {
                const audioTrack = localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !audioTrack.enabled;
                    isMicOn = audioTrack.enabled;
                    // Kirim status mic kembali ke monitor
                    const controlConn = peer.connect(conn.peer);
                    controlConn.on('open', () => controlConn.send({ type: 'MIC_STATUS', status: isMicOn }));
                }
            }
        } else if (data.type === 'CAMERA_LIST') {
            const wrapper = document.getElementById("wrapper-" + conn.peer);
            if (wrapper) {
                let select = wrapper.querySelector('.remote-cam-select');
                if (!select) {
                    select = document.createElement('select');
                    select.className = 'remote-cam-select';
                    wrapper.appendChild(select);
                    select.onchange = () => {
                        const controlConn = peer.connect(conn.peer);
                        controlConn.on('open', () => controlConn.send({ type: 'SWITCH_CAMERA', deviceId: select.value }));
                    };
                }
                select.innerHTML = '';
                data.data.forEach(cam => {
                    const opt = document.createElement('option');
                    opt.value = cam.id;
                    opt.text = cam.label;
                    select.appendChild(opt);
                });
            }
        } else if (data.type === 'MIC_STATUS') {
            // Monitor menerima update status mic dari kamera
            const btnRemoteMic = document.getElementById('btnRemoteMic-' + conn.peer);
            if(btnRemoteMic) btnRemoteMic.innerHTML = data.status ? iconMicOn : iconMicOff;
        }
    });
});

// ==========================================
// 3. INISIALISASI & QR CODE
// ==========================================
peer.on('open', id => {
    document.getElementById('myIdLarge').innerText = id;
    document.getElementById('myIdSmall').innerText = id;
    const qrBox = document.getElementById("qrcode");
    qrBox.innerHTML = ""; 
    new QRCode(qrBox, { text: id, width: 180, height: 180, colorDark : "#000000", colorLight : "#ffffff" });
});

async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } 
    catch (err) { console.error(err); }
}

// ==========================================
// 4. KONTROL NAVIGASI (SIDEBAR)
// ==========================================
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
if(menuToggle) menuToggle.onclick = () => sidebar.classList.toggle('open'); 

const navMonitor = document.getElementById('navMonitor');
const navKamera = document.getElementById('navKamera');
const navGaleri = document.getElementById('navGaleri');
const viewMonitor = document.getElementById('viewMonitor');
const viewKamera = document.getElementById('viewKamera');
const viewGaleri = document.getElementById('viewGaleri');
const sidebarKameraSettings = document.getElementById('sidebarKameraSettings');

function switchView(activeNav, activeView) {
    [navMonitor, navKamera, navGaleri].forEach(btn => btn.classList.remove('active'));
    activeNav.classList.add('active');
    [viewMonitor, viewKamera, viewGaleri].forEach(view => view.classList.add('hidden'));
    activeView.classList.remove('hidden');
    sidebar.classList.remove('open'); 

    if (activeNav === navKamera) {
        sidebarKameraSettings.classList.remove('hidden');
        requestWakeLock();
        mulaiKamera();
    } else {
        sidebarKameraSettings.classList.add('hidden');
        matikanKamera();
    }
}

navMonitor.onclick = () => switchView(navMonitor, viewMonitor);
navKamera.onclick = () => switchView(navKamera, viewKamera);
navGaleri.onclick = () => switchView(navGaleri, viewGaleri);

function matikanKamera() {
    if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
    if (wakeLock) { wakeLock.release().then(() => wakeLock = null); }
    isIntentionallyClosed = true;
    activeCalls.forEach(call => call.close());
    activeCalls = [];
}

// ==========================================
// 5. LOGIKA PENERIMA (MONITOR CCTV) 
// ==========================================
const monitorDisconnected = document.getElementById('monitorDisconnected');
const monitorConnected = document.getElementById('monitorConnected');
const wadahUtama = document.getElementById('videoContainer');
let connectedDevices = 0;

peer.on('call', function(call) {
    call.answer(); 
    
    call.on('stream', function(remoteStream) {
        if (document.getElementById("wrapper-" + call.peer)) return;
        
        monitorDisconnected.classList.add('hidden');
        monitorConnected.classList.remove('hidden');
        connectedDevices++;

        const wrapper = document.createElement('div');
        wrapper.className = 'video-box-container';
        wrapper.id = "wrapper-" + call.peer;

        const btnClose = document.createElement('button');
        btnClose.className = 'btn-close-video';
        btnClose.innerText = '✖';
        btnClose.onclick = () => { call.close(); wrapper.remove(); checkEmptyMonitor(); };

        const btnRefresh = document.createElement('button');
        btnRefresh.className = 'btn-refresh-video';
        btnRefresh.innerText = '🔄';
        btnRefresh.onclick = () => {
            const conn = peer.connect(call.peer);
            conn.on('open', () => conn.send({ type: 'RECONNECT' }));
        };

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; 
        video.srcObject = remoteStream;

        // PEMBUATAN KONTROL BAWAH (BARU)
        const controls = document.createElement('div');
        controls.className = 'video-controls';

        // 1. Tombol Mic (Kamera)
        const btnRemoteMic = document.createElement('button');
        btnRemoteMic.className = 'btn-vid-action';
        btnRemoteMic.id = 'btnRemoteMic-' + call.peer;
        btnRemoteMic.innerHTML = iconMicOn;
        btnRemoteMic.title = "Matikan/Nyalakan Mic Kamera";
        btnRemoteMic.onclick = () => {
            const conn = peer.connect(call.peer);
            conn.on('open', () => conn.send({ type: 'TOGGLE_MIC' }));
        };

        // 2. Tombol Speaker (Monitor)
        const btnSound = document.createElement('button');
        btnSound.className = 'btn-vid-action';
        btnSound.innerHTML = iconSpeakerOff;
        btnSound.title = "Dengarkan Suara Kamera";
        btnSound.onclick = () => {
            if (video.muted) { 
                video.muted = false; 
                btnSound.innerHTML = iconSpeakerOn; 
            } else { 
                video.muted = true; 
                btnSound.innerHTML = iconSpeakerOff; 
            }
        };

        // 3. Tombol Rekam Video
        const btnRecord = document.createElement('button');
        btnRecord.className = 'btn-vid-action';
        btnRecord.innerHTML = iconVideoRecord;
        btnRecord.title = "Rekam Video";
        
        let mediaRecorder; let recordedChunks = []; let isRecording = false;
        btnRecord.onclick = () => {
            if (!isRecording) {
                recordedChunks = [];
                mediaRecorder = new MediaRecorder(remoteStream, { mimeType: 'video/webm; codecs=vp9' });
                mediaRecorder.ondataavailable = e => { if(e.data.size > 0) recordedChunks.push(e.data); };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `Rekaman_${new Date().getTime()}.webm`;
                    a.click();
                };
                mediaRecorder.start(); 
                isRecording = true; 
                btnRecord.innerHTML = iconVideoStop;
                btnRecord.classList.add('is-recording'); // Animasi merah
            } else { 
                mediaRecorder.stop(); 
                isRecording = false; 
                btnRecord.innerHTML = iconVideoRecord;
                btnRecord.classList.remove('is-recording');
            }
        };

        // 4. Tombol Jepret Foto
        const btnSnap = document.createElement('button');
        btnSnap.className = 'btn-vid-action';
        btnSnap.innerHTML = iconCamera;
        btnSnap.title = "Jepret Foto";
        btnSnap.onclick = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            const a = document.createElement('a');
            a.href = canvas.toDataURL("image/png");
            a.download = `Foto_${new Date().getTime()}.png`;
            a.click();
        };

        // 5. Tombol SD/HD (Remote Quality)
        const btnQuality = document.createElement('button');
        btnQuality.className = 'btn-vid-action';
        let monitorQuality = 'SD';
        btnQuality.innerHTML = iconSD;
        btnQuality.title = "Ubah Kualitas (SD/HD)";
        btnQuality.onclick = () => {
            monitorQuality = monitorQuality === 'SD' ? 'HD' : 'SD';
            btnQuality.innerHTML = monitorQuality === 'HD' ? iconHD : iconSD;
            
            // Kirim perintah ke kamera untuk ganti resolusi
            const conn = peer.connect(call.peer);
            conn.on('open', () => conn.send({ type: 'SET_QUALITY', quality: monitorQuality }));
        };

        // Masukkan semua tombol ke panel
        controls.appendChild(btnRemoteMic);
        controls.appendChild(btnSound);
        controls.appendChild(btnRecord);
        controls.appendChild(btnSnap);
        controls.appendChild(btnQuality);
        
        wrapper.appendChild(btnClose);
        wrapper.appendChild(btnRefresh);
        wrapper.appendChild(video);
        wrapper.appendChild(controls);
        wadahUtama.appendChild(wrapper);
        
        video.play().catch(e => console.log(e));
    });

    call.on('close', () => {
        const wrapper = document.getElementById("wrapper-" + call.peer);
        if (wrapper) wrapper.remove();
        checkEmptyMonitor();
    });
});

function checkEmptyMonitor() {
    connectedDevices--;
    if (wadahUtama.children.length === 0) {
        monitorConnected.classList.add('hidden');
        monitorDisconnected.classList.remove('hidden');
        connectedDevices = 0;
    }
}

// ==========================================
// 6. LOGIKA PENGIRIM & OPTIMASI KAMERA
// ==========================================
const kameraSelect = document.getElementById('kameraSelect');
const videoKirim = document.getElementById('videoKirim');
const btnDisconnectSender = document.getElementById('btnDisconnectSender');
const statusPengirim = document.getElementById('statusPengirim');

async function getDaftarKamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        kameraSelect.innerHTML = '';
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Kamera ${index + 1}`;
            kameraSelect.appendChild(option);
        });
    } catch (error) {}
}

async function mulaiKamera(deviceId = null) {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    
    // Terapkan kualitas berdasarkan pilihan tombol HD/SD dari monitor
    const isHD = currentQuality === 'HD';
    
    const constraints = { 
        video: deviceId ? { deviceId: { exact: deviceId } } : { 
            facingMode: 'environment',
            width: isHD ? { ideal: 1280 } : { ideal: 640 },
            height: isHD ? { ideal: 720 } : { ideal: 480 },
            frameRate: { ideal: 24 }
        }, 
        audio: {
            echoCancellation: true, 
            noiseSuppression: true, 
            autoGainControl: true   
        }
    };
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoKirim.srcObject = localStream;
        
        // Sesuaikan status mic sesuai permintaan remote sebelumnya
        const audioTrack = localStream.getAudioTracks()[0];
        if(audioTrack) audioTrack.enabled = isMicOn;

        const track = localStream.getVideoTracks()[0];
        const settings = track.getSettings();
        if (settings.facingMode === 'user' || track.label.toLowerCase().includes('front')) {
            videoKirim.classList.add('mirrored');
        } else {
            videoKirim.classList.remove('mirrored');
        }

        if (kameraSelect.options.length === 0) await getDaftarKamera();
        
        activeCalls.forEach(call => {
            if (call.peerConnection) {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(track);
            }
        });
    } catch (error) { console.log("Gagal akses kamera: ", error); }
}

kameraSelect.addEventListener('change', () => mulaiKamera(kameraSelect.value));
document.getElementById('targetId').addEventListener('input', function() { this.value = this.value.toUpperCase(); });

function hubungkanKePenerima(target) {
    activeCalls.forEach(call => call.close());
    activeCalls = [];

    if (peer.disconnected) peer.reconnect(); 

    const call = peer.call(target, localStream);
    activeCalls.push(call);
    
    const conn = peer.connect(target);
    conn.on('open', () => {
        const devices = Array.from(document.getElementById('kameraSelect').options).map(opt => ({ id: opt.value, label: opt.text }));
        conn.send({ type: 'CAMERA_LIST', data: devices });
        // Beri tahu monitor status mic awal
        conn.send({ type: 'MIC_STATUS', status: isMicOn });
    });
    
    statusPengirim.innerText = "Menyambungkan...";
    btnDisconnectSender.classList.remove('hidden');
    
    call.on('stream', () => statusPengirim.innerText = "Terhubung dengan aman!");
    
    call.on('close', () => {
        activeCalls = activeCalls.filter(c => c !== call);
        if (!isIntentionallyClosed) {
            statusPengirim.innerText = "Sinyal putus. Auto-Reconnect dalam 3 detik...";
            setTimeout(() => { 
                if(!isIntentionallyClosed && targetToReconnect) hubungkanKePenerima(targetToReconnect); 
            }, 3000);
        } else {
            statusPengirim.innerText = "Koneksi diputus.";
            btnDisconnectSender.classList.add('hidden');
        }
    });
}

document.getElementById('btnConnect').addEventListener('click', () => {
    const target = document.getElementById('targetId').value.toUpperCase();
    if (!target || target.length !== 8) return alert("Pastikan ID berisi 8 karakter!");
    targetToReconnect = target; isIntentionallyClosed = false;
    hubungkanKePenerima(target);
});

btnDisconnectSender.addEventListener('click', () => {
    isIntentionallyClosed = true; 
    activeCalls.forEach(call => call.close()); activeCalls = [];
    btnDisconnectSender.classList.add('hidden');
    statusPengirim.innerText = "Koneksi telah dihentikan manual.";
});