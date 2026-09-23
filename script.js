function generateShortId() { return Math.random().toString(36).substring(2, 10).toUpperCase(); }

const myCustomId = generateShortId();
const peer = new Peer(myCustomId);

let localStream = null;
let activeCalls = []; 
let targetToReconnect = null; 
let isIntentionallyClosed = false; 
let wakeLock = null; 

// Generate QR Code & Tampilkan ID
peer.on('open', id => {
    document.getElementById('myIdLarge').innerText = id;
    document.getElementById('myIdSmall').innerText = id;
    
    // Buat QR Code
    new QRCode(document.getElementById("qrcode"), {
        text: id,
        width: 180,
        height: 180,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
});

peer.on('disconnected', () => peer.reconnect());

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) { console.error(err); }
}

// ==========================================
// KONTROL NAVIGASI (SIDEBAR)
// ==========================================
const navMonitor = document.getElementById('navMonitor');
const navKamera = document.getElementById('navKamera');
const navGaleri = document.getElementById('navGaleri');

const viewMonitor = document.getElementById('viewMonitor');
const viewKamera = document.getElementById('viewKamera');
const viewGaleri = document.getElementById('viewGaleri');
const sidebarKameraSettings = document.getElementById('sidebarKameraSettings');

function switchView(activeNav, activeView) {
    // Reset Navigation
    [navMonitor, navKamera, navGaleri].forEach(btn => btn.classList.remove('active'));
    activeNav.classList.add('active');

    // Reset Views
    [viewMonitor, viewKamera, viewGaleri].forEach(view => view.classList.add('hidden'));
    activeView.classList.remove('hidden');

    // Tampilkan pengaturan kamera hanya di mode kamera
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
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (wakeLock) {
        wakeLock.release().then(() => wakeLock = null);
    }
    isIntentionallyClosed = true;
    activeCalls.forEach(call => call.close());
    activeCalls = [];
}

// ==========================================
// LOGIKA PENERIMA (MONITOR) 
// ==========================================
const monitorDisconnected = document.getElementById('monitorDisconnected');
const monitorConnected = document.getElementById('monitorConnected');
const wadahUtama = document.getElementById('videoContainer');
let connectedDevices = 0;

peer.on('call', function(call) {
    call.answer(); 
    
    call.on('stream', function(remoteStream) {
        if (document.getElementById("wrapper-" + call.peer)) return;
        
        // Pindahkan tampilan dari QR Code ke Layar Video
        monitorDisconnected.classList.add('hidden');
        monitorConnected.classList.remove('hidden');
        connectedDevices++;

        const wrapper = document.createElement('div');
        wrapper.className = 'video-box-container';
        wrapper.id = "wrapper-" + call.peer;

        const btnClose = document.createElement('button');
        btnClose.className = 'btn-close-video';
        btnClose.innerText = '✖';
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; 
        video.srcObject = remoteStream;

        const controls = document.createElement('div');
        controls.className = 'video-controls';

        const btnSnap = document.createElement('button');
        btnSnap.className = 'btn-vid-action';
        btnSnap.innerText = "📸 Foto";
        
        const btnRecord = document.createElement('button');
        btnRecord.className = 'btn-vid-action btn-record';
        btnRecord.innerText = "🔴 Rekam";
        
        let mediaRecorder;
        let recordedChunks = [];
        let isRecording = false;

        btnRecord.onclick = () => {
            if (!isRecording) {
                recordedChunks = [];
                mediaRecorder = new MediaRecorder(remoteStream, { mimeType: 'video/webm; codecs=vp9' });
                mediaRecorder.ondataavailable = e => { if(e.data.size > 0) recordedChunks.push(e.data); };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `CamConnect_Video_${new Date().getTime()}.webm`;
                    a.click();
                    URL.revokeObjectURL(url);
                };
                mediaRecorder.start();
                isRecording = true;
                btnRecord.innerText = "⏹ Berhenti";
            } else {
                mediaRecorder.stop();
                isRecording = false;
                btnRecord.innerText = "🔴 Rekam";
            }
        };

        const canvas = document.createElement('canvas');
        canvas.style.display = 'none';
        
        btnSnap.onclick = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            const a = document.createElement('a');
            a.href = canvas.toDataURL("image/png");
            a.download = `CamConnect_Foto_${new Date().getTime()}.png`;
            a.click();
        };

        btnClose.onclick = () => {
            call.close(); 
            wrapper.remove();
            checkEmptyMonitor();
        };

        controls.appendChild(btnSnap);
        controls.appendChild(btnRecord);
        wrapper.appendChild(btnClose);
        wrapper.appendChild(video);
        wrapper.appendChild(controls);
        wrapper.appendChild(canvas);
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
        // Kembali ke tampilan awal QR jika tidak ada kamera tersisa
        monitorConnected.classList.add('hidden');
        monitorDisconnected.classList.remove('hidden');
        connectedDevices = 0;
    }
}

// ==========================================
// LOGIKA PENGIRIM (KAMERA)
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
    const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' } };
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoKirim.srcObject = localStream;
        
        const track = localStream.getVideoTracks()[0];
        const settings = track.getSettings();
        const label = track.label.toLowerCase();

        if (settings.facingMode === 'user' || label.includes('front') || label.includes('depan')) {
            videoKirim.classList.add('mirrored');
        } else {
            videoKirim.classList.remove('mirrored');
        }

        setTimeout(async () => {
            try {
                const caps = track.getCapabilities();
                const nativeControls = document.getElementById('nativeControls');
                let hasFeatures = false;

                const btnTorch = document.getElementById('btnTorch');
                if (caps.torch) {
                    hasFeatures = true;
                    btnTorch.classList.remove('hidden');
                    let isTorchOn = false;
                    btnTorch.onclick = async () => {
                        isTorchOn = !isTorchOn;
                        await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
                    };
                } else btnTorch.classList.add('hidden');

                const zoomContainer = document.getElementById('zoomContainer');
                const zoomSlider = document.getElementById('zoomSlider');
                if (caps.zoom) {
                    hasFeatures = true;
                    zoomContainer.classList.remove('hidden');
                    zoomSlider.min = caps.zoom.min;
                    zoomSlider.max = caps.zoom.max;
                    zoomSlider.step = caps.zoom.step;
                    zoomSlider.value = settings.zoom || caps.zoom.min;
                    zoomSlider.oninput = async (e) => await track.applyConstraints({ advanced: [{ zoom: parseFloat(e.target.value) }] });
                } else zoomContainer.classList.add('hidden');

                if (hasFeatures) nativeControls.classList.remove('hidden');
                else nativeControls.classList.add('hidden');
            } catch (e) {}
        }, 1000);

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
    targetToReconnect = target;
    isIntentionallyClosed = false;
    hubungkanKePenerima(target);
});

btnDisconnectSender.addEventListener('click', () => {
    isIntentionallyClosed = true; 
    activeCalls.forEach(call => call.close());
    activeCalls = [];
    btnDisconnectSender.classList.add('hidden');
    statusPengirim.innerText = "Koneksi telah dihentikan manual.";
});