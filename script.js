function generateShortId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

const myCustomId = generateShortId();
const peer = new Peer(myCustomId);

let localStream = null;
let activeCalls = []; 
let targetToReconnect = null; // Menyimpan ID target untuk auto-reconnect
let isIntentionallyClosed = false; // Deteksi putus sengaja atau sinyal hilang
let wakeLock = null; // Untuk mencegah HP tidur (background)

peer.on('open', id => document.getElementById('myId').innerText = id);

// Jika peer terputus dari server (karena pindah wifi), otomatis sambung ulang ke server
peer.on('disconnected', () => {
    console.log("Koneksi server putus, mencoba menyambung kembali...");
    peer.reconnect();
});

// Fitur Anti-Sleep (WakeLock) agar kamera tak mati saat ditinggal
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock aktif: Layar tidak akan mati otomatis.');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

// Navigasi & Fix Bug Keluar/Kembali Menu
const btnHome = document.getElementById('btnHome');
btnHome.addEventListener('click', () => {
    document.getElementById('modeSelection').classList.remove('hidden');
    document.getElementById('uiPenerima').classList.add('hidden');
    document.getElementById('uiPengirim').classList.add('hidden');
    btnHome.classList.add('hidden');
    
    isIntentionallyClosed = true; // Jangan auto-reconnect

    // Hapus semua panggilan aktif
    activeCalls.forEach(call => call.close());
    activeCalls = [];
    
    // Matikan kamera sepenuhnya
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Hapus layar monitor penerima agar fresh saat masuk lagi
    document.getElementById('videoContainer').innerHTML = '';
    
    if (wakeLock) {
        wakeLock.release().then(() => wakeLock = null);
    }
});

// ==========================================
// LOGIKA PENERIMA (MONITOR) + REKAM VIDEO
// ==========================================
document.getElementById('btnPenerima').addEventListener('click', () => {
    document.getElementById('modeSelection').classList.add('hidden');
    document.getElementById('uiPenerima').classList.remove('hidden');
    btnHome.classList.remove('hidden');
});

peer.on('call', function(call) {
    call.answer(); 
    
    call.on('stream', function(remoteStream) {
        if (document.getElementById("wrapper-" + call.peer)) return;
        document.getElementById('statusPenerima').innerText = "Terhubung dengan kamera baru!";

        const wadahUtama = document.getElementById('videoContainer');
        const wrapper = document.createElement('div');
        wrapper.className = 'video-box-container';
        wrapper.id = "wrapper-" + call.peer;

        const box = document.createElement('div');
        box.className = 'video-box';
        
        const label = document.createElement('div');
        label.className = 'video-title';
        label.innerText = "ID: " + call.peer;

        // Tombol Hapus (X)
        const btnClose = document.createElement('button');
        btnClose.className = 'btn-close-video';
        btnClose.innerText = '✖';
        btnClose.onclick = () => {
            call.close(); 
            wrapper.remove();
        };

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; 
        video.srcObject = remoteStream;

        // Kontainer Tombol
        const controls = document.createElement('div');
        controls.className = 'video-controls';

        // 1. Tombol Jepret
        const btnSnap = document.createElement('button');
        btnSnap.className = 'btn-vid-action';
        btnSnap.innerText = "📸 Foto";
        
        // 2. Tombol Rekam Video
        const btnRecord = document.createElement('button');
        btnRecord.className = 'btn-vid-action btn-record';
        btnRecord.innerText = "🔴 Rekam";
        
        let mediaRecorder;
        let recordedChunks = [];
        let isRecording = false;

        btnRecord.onclick = () => {
            if (!isRecording) {
                // Mulai Merekam
                recordedChunks = [];
                mediaRecorder = new MediaRecorder(remoteStream, { mimeType: 'video/webm; codecs=vp9' });
                
                mediaRecorder.ondataavailable = e => { if(e.data.size > 0) recordedChunks.push(e.data); };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Rekaman_${call.peer}_${new Date().getTime()}.webm`;
                    a.click();
                    URL.revokeObjectURL(url);
                };
                
                mediaRecorder.start();
                isRecording = true;
                btnRecord.innerText = "⏹ Berhenti";
                btnRecord.classList.add('is-recording');
            } else {
                // Berhenti Merekam
                mediaRecorder.stop();
                isRecording = false;
                btnRecord.innerText = "🔴 Rekam";
                btnRecord.classList.remove('is-recording');
            }
        };

        // Kanvas Foto
        const canvas = document.createElement('canvas');
        canvas.style.display = 'none';
        
        btnSnap.onclick = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Unduh foto otomatis
            const a = document.createElement('a');
            a.href = canvas.toDataURL("image/png");
            a.download = `Foto_${call.peer}_${new Date().getTime()}.png`;
            a.click();
        };

        controls.appendChild(btnSnap);
        controls.appendChild(btnRecord);

        box.appendChild(label);
        box.appendChild(btnClose);
        box.appendChild(video);
        box.appendChild(controls);
        box.appendChild(canvas);
        
        wrapper.appendChild(box);
        wadahUtama.appendChild(wrapper);
        
        video.play().catch(e => console.log(e));
    });

    call.on('close', () => {
        const wrapper = document.getElementById("wrapper-" + call.peer);
        if (wrapper) wrapper.remove();
    });
});

// ==========================================
// LOGIKA PENGIRIM (KAMERA)
// ==========================================
const kameraSelect = document.getElementById('kameraSelect');
const videoKirim = document.getElementById('videoKirim');

document.getElementById('btnPengirim').addEventListener('click', () => {
    document.getElementById('modeSelection').classList.add('hidden');
    document.getElementById('uiPengirim').classList.remove('hidden');
    btnHome.classList.remove('hidden');
    requestWakeLock(); // Paksa layar agar tidak tidur
    mulaiKamera(); 
});

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

        // 1. CEK MIRROR KAMERA DEPAN
        if (settings.facingMode === 'user' || label.includes('front') || label.includes('depan')) {
            videoKirim.classList.add('mirrored');
        } else {
            videoKirim.classList.remove('mirrored');
        }

        // 2. CEK FITUR KAMERA BAWAAN (Flash & Zoom)
        setTimeout(async () => {
            try {
                const caps = track.getCapabilities();
                const nativeControls = document.getElementById('nativeControls');
                let hasFeatures = false;

                // Flashlight (Torch)
                const btnTorch = document.getElementById('btnTorch');
                if (caps.torch) {
                    hasFeatures = true;
                    btnTorch.classList.remove('hidden');
                    let isTorchOn = false;
                    btnTorch.onclick = async () => {
                        isTorchOn = !isTorchOn;
                        await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
                        btnTorch.innerText = isTorchOn ? "🔦 Matikan Flash" : "🔦 Nyalakan Flash";
                    };
                } else {
                    btnTorch.classList.add('hidden');
                }

                // Zoom
                const zoomContainer = document.getElementById('zoomContainer');
                const zoomSlider = document.getElementById('zoomSlider');
                if (caps.zoom) {
                    hasFeatures = true;
                    zoomContainer.classList.remove('hidden');
                    zoomSlider.min = caps.zoom.min;
                    zoomSlider.max = caps.zoom.max;
                    zoomSlider.step = caps.zoom.step;
                    zoomSlider.value = settings.zoom || caps.zoom.min;
                    
                    zoomSlider.oninput = async (e) => {
                        await track.applyConstraints({ advanced: [{ zoom: parseFloat(e.target.value) }] });
                    };
                } else {
                    zoomContainer.classList.add('hidden');
                }

                if (hasFeatures) nativeControls.classList.remove('hidden');
                else nativeControls.classList.add('hidden');

            } catch (e) { console.log("Fitur kamera bawaan tidak didukung browser ini."); }
        }, 1000);

        if (kameraSelect.options.length === 0) await getDaftarKamera();
        
        // Update video ke koneksi aktif (jika ada ganti kamera)
        activeCalls.forEach(call => {
            if (call.peerConnection) {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(track);
            }
        });
    } catch (error) {
        alert("Gagal akses kamera.");
    }
}

kameraSelect.addEventListener('change', () => mulaiKamera(kameraSelect.value));
document.getElementById('targetId').addEventListener('input', function() { this.value = this.value.toUpperCase(); });

// FUNGSI SAMBUNG & AUTO-RECONNECT
function hubungkanKePenerima(target) {
    const call = peer.call(target, localStream);
    activeCalls.push(call);
    
    document.getElementById('statusPengirim').innerText = "Sedang menyambungkan...";
    document.getElementById('btnDisconnectSender').style.display = 'block';
    
    call.on('stream', () => {
        document.getElementById('statusPengirim').innerText = "Berhasil terhubung!";
    });

    // Jika koneksi putus (misal beda WiFi/Sinyal hilang)
    call.on('close', () => {
        activeCalls = activeCalls.filter(c => c !== call);
        
        if (!isIntentionallyClosed) {
            document.getElementById('statusPengirim').innerText = "Koneksi terputus. Mencoba menyambung kembali (Auto-Reconnect)...";
            // Coba sambung ulang otomatis setelah 3 detik
            setTimeout(() => {
                if(!isIntentionallyClosed && targetToReconnect) {
                    hubungkanKePenerima(targetToReconnect);
                }
            }, 3000);
        } else {
            document.getElementById('statusPengirim').innerText = "Koneksi diputus.";
            document.getElementById('btnDisconnectSender').style.display = 'none';
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

// Tombol X pengirim
document.getElementById('btnDisconnectSender').addEventListener('click', () => {
    isIntentionallyClosed = true; 
    activeCalls.forEach(call => call.close());
    activeCalls = [];
    document.getElementById('btnDisconnectSender').style.display = 'none';
    document.getElementById('statusPengirim').innerText = "Koneksi telah dihentikan manual.";
});