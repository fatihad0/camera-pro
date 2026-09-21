// Fungsi membuat ID 8 Karakter (Kombinasi huruf kapital & angka)
function generateShortId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

const myCustomId = generateShortId();
// Inisialisasi PeerJS dengan custom ID yang sudah dibuat
const peer = new Peer(myCustomId);
let localStream = null;
let activeCalls = []; // Menyimpan semua koneksi

peer.on('open', function(id) {
    document.getElementById('myId').innerText = id;
});

// Kontrol Navigasi
const btnHome = document.getElementById('btnHome');
const modeSelection = document.getElementById('modeSelection');
const uiPenerima = document.getElementById('uiPenerima');
const uiPengirim = document.getElementById('uiPengirim');

btnHome.addEventListener('click', () => {
    modeSelection.classList.remove('hidden');
    uiPenerima.classList.add('hidden');
    uiPengirim.classList.add('hidden');
    btnHome.classList.add('hidden');
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
});

// ==========================================
// LOGIKA PENERIMA (MONITOR)
// ==========================================
document.getElementById('btnPenerima').addEventListener('click', () => {
    modeSelection.classList.add('hidden');
    uiPenerima.classList.remove('hidden');
    btnHome.classList.remove('hidden');
});

peer.on('call', function(call) {
    call.answer(); 
    
    call.on('stream', function(remoteStream) {
        if (document.getElementById("wrapper-" + call.peer)) return;

        const wadahUtama = document.getElementById('videoContainer');
        
        const wrapper = document.createElement('div');
        wrapper.className = 'video-box-container';
        wrapper.id = "wrapper-" + call.peer;

        const box = document.createElement('div');
        box.className = 'video-box';
        
        const label = document.createElement('div');
        label.className = 'video-title';
        label.innerText = call.peer;
        
        // TOMBOL X UNTUK MEMUTUS PAKSA KAMERA
        const btnClose = document.createElement('button');
        btnClose.className = 'btn-close-video';
        btnClose.innerText = '✖';
        btnClose.onclick = () => {
            call.close(); // Putuskan jalur WebRTC
            wrapper.remove(); // Hapus dari layar PC
        };

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; 
        video.srcObject = remoteStream;

        const btnSnap = document.createElement('button');
        btnSnap.className = 'btn-snap';
        btnSnap.innerText = "📸 Jepret";
        
        const canvas = document.createElement('canvas');
        canvas.style.display = 'none';
        
        const hasilImg = document.createElement('img');
        hasilImg.className = 'result-img';

        btnSnap.onclick = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            hasilImg.src = canvas.toDataURL("image/png");
            hasilImg.style.display = 'block';
        };

        box.appendChild(label);
        box.appendChild(btnClose);
        box.appendChild(video);
        box.appendChild(btnSnap);
        box.appendChild(canvas);
        
        wrapper.appendChild(box);
        wrapper.appendChild(hasilImg);
        wadahUtama.appendChild(wrapper);
        
        video.play().catch(e => console.log(e));
    });

    // Jika HP memutus koneksi, otomatis hapus kotaknya dari layar PC
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
const btnDisconnectSender = document.getElementById('btnDisconnectSender');

document.getElementById('btnPengirim').addEventListener('click', () => {
    modeSelection.classList.add('hidden');
    uiPengirim.classList.remove('hidden');
    btnHome.classList.remove('hidden');
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
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' } };
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoKirim.srcObject = localStream;
        if (kameraSelect.options.length === 0) await getDaftarKamera();
        
        activeCalls.forEach(call => {
            if (call.peerConnection) {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(localStream.getVideoTracks()[0]);
            }
        });
    } catch (error) {
        alert("Gagal akses kamera.");
    }
}

kameraSelect.addEventListener('change', () => mulaiKamera(kameraSelect.value));

// Memaksa input agar otomatis menjadi huruf besar (UPPERCASE)
document.getElementById('targetId').addEventListener('input', function() {
    this.value = this.value.toUpperCase();
});

document.getElementById('btnConnect').addEventListener('click', () => {
    const target = document.getElementById('targetId').value.toUpperCase();
    if (!target || target.length !== 8) return alert("Pastikan ID berisi 8 karakter!");

    const call = peer.call(target, localStream);
    activeCalls.push(call);
    
    // Munculkan tombol X merah di HP
    btnDisconnectSender.style.display = 'block';
    
    call.on('close', () => {
        activeCalls = activeCalls.filter(c => c !== call);
        if(activeCalls.length === 0) btnDisconnectSender.style.display = 'none';
    });
});

// TOMBOL X UNTUK MEMUTUS PAKSA DARI SISI PENGIRIM (HP)
btnDisconnectSender.addEventListener('click', () => {
    activeCalls.forEach(call => call.close());
    activeCalls = [];
    btnDisconnectSender.style.display = 'none';
    alert("Koneksi ke monitor berhasil diputus.");
});