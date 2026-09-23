function generateShortId() { return Math.random().toString(36).substring(2, 10).toUpperCase(); }

const myCustomId = generateShortId();
const peer = new Peer(myCustomId);

let localStream = null;
let activeCalls = []; 
let targetToReconnect = null; 
let isIntentionallyClosed = false; 
let wakeLock = null; 

// ==========================================
// 1. EVENT KETIKA MENERIMA PERINTAH REMOTE
// ==========================================
// (Bagian ini mengizinkan Kamera di-remote dari Monitor)
peer.on('connection', (conn) => {
    conn.on('data', async (data) => {
        // Jika Monitor menekan tombol Refresh 🔄
        if (data.type === 'RECONNECT') {
            if(targetToReconnect) hubungkanKePenerima(targetToReconnect);
        } 
        // Jika Monitor mengganti dropdown Kamera Depan/Belakang ▾
        else if (data.type === 'SWITCH_CAMERA') {
            document.getElementById('kameraSelect').value = data.deviceId;
            await mulaiKamera(data.deviceId);
        }
        // Jika Monitor menerima daftar kamera dari Pengirim
        else if (data.type === 'CAMERA_LIST') {
            const wrapper = document.getElementById("wrapper-" + conn.peer);
            if (wrapper) {
                let select = wrapper.querySelector('.remote-cam-select');
                if (!select) {
                    select = document.createElement('select');
                    select.className = 'remote-cam-select';
                    wrapper.appendChild(select);
                    
                    // Kirim sinyal balik jika Monitor ganti pilihan
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
        }
    });
});

// ==========================================
// 2. PEMBUATAN QR & INISIALISASI
// ==========================================
peer.on('open', id => {
    document.getElementById('myIdLarge').innerText = id;
    document.getElementById('myIdSmall').innerText = id;
    
    // FIX BUG QR CODE: Hapus isi QR lama sebelum buat baru
    const qrBox = document.getElementById("qrcode");
    qrBox.innerHTML = ""; 
    new QRCode(qrBox, { text: id, width: 180, height: 180, colorDark : "#000000", colorLight : "#ffffff" });
});

peer.on('disconnected', () => peer.reconnect());

async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } 
    catch (err) { console.error(err); }
}

// ==========================================
// 3. KONTROL NAVIGASI (SIDEBAR & HAMBURGER)
// ==========================================
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
menuToggle.onclick = () => sidebar.classList.toggle('open'); // Fitur Hamburger

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
    sidebar.classList.remove('open'); // Tutup sidebar otomatis saat menu dipilih di HP

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
// 4. LOGIKA PENERIMA (MONITOR) 
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

        // Tombol X (Tutup)
        const btnClose = document.createElement('button');
        btnClose.className = 'btn-close-video';
        btnClose.innerText = '✖';
        btnClose.onclick = () => { call.close(); wrapper.remove(); checkEmptyMonitor(); };

        // Tombol Refresh/Reconnect
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

        const controls = document.createElement('div');
        controls.className = 'video-controls';

        // Fitur Suara, Foto, dan Rekam
        const btnSound = document.createElement('button');
        btnSound.className = 'btn-vid-action';
        btnSound.innerText = "🔇 Bisu";
        btnSound.onclick = () => {
            if (video.muted) { video.muted = false; btnSound.innerText = "🔊 Suara Nyala"; btnSound.style.background = "#C4EED0"; } 
            else { video.muted = true; btnSound.innerText = "🔇 Bisu"; btnSound.style.background = "rgba(255,255,255,0.9)"; }
        };

        const btnSnap = document.createElement('button');
        btnSnap.className = 'btn-vid-action';
        btnSnap.innerText = "📸 Foto";
        
        const btnRecord = document.createElement('button');
        btnRecord.className = 'btn-vid-action btn-record';
        btnRecord.innerText = "🔴 Rekam";
        
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
                mediaRecorder.start(); isRecording = true; btnRecord.innerText = "⏹ Stop";
            } else { mediaRecorder.stop(); isRecording = false; btnRecord.innerText = "🔴 Rekam"; }
        };

        btnSnap.onclick = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            const a = document.createElement('a');
            a.href = canvas.toDataURL("image/png");
            a.download = `Foto_${new Date().getTime()}.png`;
            a.click();
        };

        controls.appendChild(btnSound);
        controls.appendChild(btnSnap);
        controls.appendChild(btnRecord);
        
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
// 5. LOGIKA PENGIRIM (KAMERA)
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
    const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }, audio: true };
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoKirim.srcObject = localStream;
        
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
    } catch (error) { console.log("Gagal akses kamera."); }
}

kameraSelect.addEventListener('change', () => mulaiKamera(kameraSelect.value));
document.getElementById('targetId').addEventListener('input', function() { this.value = this.value.toUpperCase(); });

function hubungkanKePenerima(target) {
    const call = peer.call(target, localStream);
    activeCalls.push(call);
    
    // Kirim informasi daftar lensa kamera ke Monitor
    const conn = peer.connect(target);
    conn.on('open', () => {
        const devices = Array.from(document.getElementById('kameraSelect').options).map(opt => ({ id: opt.value, label: opt.text }));
        conn.send({ type: 'CAMERA_LIST', data: devices });
    });
    
    statusPengirim.innerText = "Menyambungkan...";
    btnDisconnectSender.classList.remove('hidden');
    
    call.on('stream', () => statusPengirim.innerText = "Terhubung!");
    call.on('close', () => {
        activeCalls = activeCalls.filter(c => c !== call);
        if (!isIntentionallyClosed) {
            statusPengirim.innerText = "Sinyal putus. Menyambung ulang (Auto-Reconnect)...";
            setTimeout(() => { if(!isIntentionallyClosed && targetToReconnect) hubungkanKePenerima(targetToReconnect); }, 3000);
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