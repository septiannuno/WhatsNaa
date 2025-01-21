const { makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// Logger configuration
const logger = pino({ 
    level: 'warn'
});

// Configuration
const DELAY_BETWEEN_MESSAGES = 1000;
const MAX_RETRIES = 3;
const CONNECTION_TIMEOUT = 60000;
const STATUS_CHECK_INTERVAL = 30000; // Check status every 30 seconds
const STATUS_DOWNLOAD_DIR = './downloaded_status';
const LIKED_STATUS_LOG = './liked_status.json';

// ASCII Art (unchanged)
const ASCII_ART = `
██╗    ██╗███╗   ██╗ █████╗  █████╗ 
██║    ██║████╗  ██║██╔══██╗██╔══██╗
██║ █╗ ██║██╔██╗ ██║███████║███████║
██║███╗██║██║╚██╗██║██╔══██║██╔══██║
╚███╔███╔╝██║ ╚████║██║  ██║██║  ██║
 ╚══╝╚══╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝
                                     
WhatsNaa V.2.0 | Enhanced WhatsApp Bot | Created By Nuno Gans
`;

// Initialize status tracking
let likedStatusIds = new Set();
let autoLikeEnabled = false;
let autoDownloadEnabled = false;
let targetContacts = new Set();

// Load previously liked status
try {
    if (fs.existsSync(LIKED_STATUS_LOG)) {
        const data = JSON.parse(fs.readFileSync(LIKED_STATUS_LOG));
        likedStatusIds = new Set(data);
    }
} catch (error) {
    console.error(`${getTimestamp()} ❌ Error loading liked status log:`, error);
}

/**
 * Function to get formatted timestamp
 */
function getTimestamp() {
    return `[${moment().format('HH:mm:ss')}]`;
}

/**
 * Function to save liked status IDs
 */
function saveLikedStatusIds() {
    try {
        fs.writeFileSync(LIKED_STATUS_LOG, JSON.stringify([...likedStatusIds]));
    } catch (error) {
        console.error(`${getTimestamp()} ❌ Error saving liked status log:`, error);
    }
}

/**
 * Status management functions
 */
async function handleStatus(sock, status) {
    if (autoLikeEnabled) {
        await likeStatus(sock, status);
    }
    
    if (autoDownloadEnabled && targetContacts.has(status.participant)) {
        await downloadStatus(sock, status);
    }
}

async function likeStatus(sock, status) {
    try {
        if (!likedStatusIds.has(status.id)) {
            await sock.sendMessage(status.from, { reactionMessage: { key: status.key, text: "❤️" } });
            likedStatusIds.add(status.id);
            saveLikedStatusIds();
            console.log(`${getTimestamp()} ❤️ Liked status from ${status.participant}`);
        }
    } catch (error) {
        console.error(`${getTimestamp()} ❌ Error liking status:`, error);
    }
}

async function downloadStatus(sock, status) {
    try {
        if (!fs.existsSync(STATUS_DOWNLOAD_DIR)) {
            fs.mkdirSync(STATUS_DOWNLOAD_DIR);
        }

        const buffer = await downloadMediaMessage(status, 'buffer', {});
        const extension = status.mimetype.split('/')[1];
        const filename = `${STATUS_DOWNLOAD_DIR}/status_${moment().format('YYYYMMDD_HHmmss')}.${extension}`;
        
        fs.writeFileSync(filename, buffer);
        console.log(`${getTimestamp()} 💾 Downloaded status from ${status.participant} to ${filename}`);
    } catch (error) {
        console.error(`${getTimestamp()} ❌ Error downloading status:`, error);
    }
}

/**
 * Enhanced menu display function
 */
function showMenu(sock) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(ASCII_ART);
    console.log(`
    ================================
    📱 WNaa - Enhanced WhatsApp Bot 📱
    ================================
    Pilih menu:
    1. Mass Send Single Target (Spam)
    2. Mass Send Multi Number (Broadcast)
    3. Status Auto-Like Settings
    4. Status Auto-Download Settings
    5. Contact Management
    6. Status Monitor Settings
    0. Keluar
    ================================
    Auto-Like Status: ${autoLikeEnabled ? '✅ ON' : '❌ OFF'}
    Auto-Download Status: ${autoDownloadEnabled ? '✅ ON' : '❌ OFF'}
    Monitored Contacts: ${targetContacts.size}
    ================================
    `);

    rl.question('Masukkan pilihan (0-6): ', async (choice) => {
        switch (choice) {
            case '1':
                await handleSingleNumberInput(sock, rl);
                break;
            case '2':
                await handleMultipleNumbersInput(sock, rl);
                break;
            case '3':
                await handleStatusAutoLikeSettings(sock, rl);
                break;
            case '4':
                await handleStatusAutoDownloadSettings(sock, rl);
                break;
            case '5':
                await handleContactManagement(sock, rl);
                break;
            case '6':
                await handleStatusMonitorSettings(sock, rl);
                break;
            case '0':
                console.log(`${getTimestamp()} 👋 Terima kasih telah menggunakan WNaa Bot!`);
                process.exit(0);
            default:
                console.log(`${getTimestamp()} ❌ Pilihan tidak valid!`);
                showMenu(sock);
        }
    });
}

/**
 * Status Auto-Like Settings Handler
 */
async function handleStatusAutoLikeSettings(sock, rl) {
    console.log(`
    ================================
    ❤️ Status Auto-Like Settings ❤️
    ================================
    1. ${autoLikeEnabled ? 'Nonaktifkan' : 'Aktifkan'} Auto-Like
    2. Reset Liked Status History
    3. Kembali ke Menu Utama
    ================================
    `);

    rl.question('Pilihan Anda (1-3): ', async (choice) => {
        switch (choice) {
            case '1':
                autoLikeEnabled = !autoLikeEnabled;
                console.log(`${getTimestamp()} ℹ️ Auto-Like ${autoLikeEnabled ? 'diaktifkan' : 'dinonaktifkan'}`);
                break;
            case '2':
                likedStatusIds.clear();
                saveLikedStatusIds();
                console.log(`${getTimestamp()} 🔄 Liked status history direset`);
                break;
            case '3':
                break;
        }
        showMenu(sock);
    });
}

/**
 * Status Auto-Download Settings Handler
 */
async function handleStatusAutoDownloadSettings(sock, rl) {
    console.log(`
    ================================
    💾 Status Auto-Download Settings 💾
    ================================
    1. ${autoDownloadEnabled ? 'Nonaktifkan' : 'Aktifkan'} Auto-Download
    2. Atur Target Kontak
    3. Bersihkan Folder Download
    4. Kembali ke Menu Utama
    ================================
    `);

    rl.question('Pilihan Anda (1-4): ', async (choice) => {
        switch (choice) {
            case '1':
                autoDownloadEnabled = !autoDownloadEnabled;
                console.log(`${getTimestamp()} ℹ️ Auto-Download ${autoDownloadEnabled ? 'diaktifkan' : 'dinonaktifkan'}`);
                break;
            case '2':
                await handleContactManagement(sock, rl);
                break;
            case '3':
                if (fs.existsSync(STATUS_DOWNLOAD_DIR)) {
                    fs.rmdirSync(STATUS_DOWNLOAD_DIR, { recursive: true });
                    fs.mkdirSync(STATUS_DOWNLOAD_DIR);
                    console.log(`${getTimestamp()} 🗑️ Folder download dibersihkan`);
                }
                break;
            case '4':
                break;
        }
        showMenu(sock);
    });
}

/**
 * Contact Management Handler
 */
async function handleContactManagement(sock, rl) {
    console.log(`
    ================================
    👥 Contact Management 👥
    ================================
    1. Tambah Kontak
    2. Hapus Kontak
    3. Lihat Daftar Kontak
    4. Kembali ke Menu Utama
    ================================
    `);

    rl.question('Pilihan Anda (1-4): ', async (choice) => {
        switch (choice) {
            case '1':
                await addContact(sock, rl);
                break;
            case '2':
                await removeContact(sock, rl);
                break;
            case '3':
                console.log('\nDaftar Kontak yang Dimonitor:');
                [...targetContacts].forEach(contact => console.log(`- ${contact}`));
                console.log();
                handleContactManagement(sock, rl);
                break;
            case '4':
                showMenu(sock);
                break;
            default:
                console.log(`${getTimestamp()} ❌ Pilihan tidak valid!`);
                handleContactManagement(sock, rl);
        }
    });
}

/**
 * Contact Management Helper Functions
 */
async function addContact(sock, rl) {
    rl.question('Masukkan nomor kontak (contoh: 628123456789): ', (number) => {
        targetContacts.add(number);
        console.log(`${getTimestamp()} ✅ Kontak ${number} ditambahkan`);
        handleContactManagement(sock, rl);
    });
}

async function removeContact(sock, rl) {
    rl.question('Masukkan nomor kontak yang akan dihapus: ', (number) => {
        if (targetContacts.delete(number)) {
            console.log(`${getTimestamp()} ✅ Kontak ${number} dihapus`);
        } else {
            console.log(`${getTimestamp()} ❌ Kontak ${number} tidak ditemukan`);
        }
        handleContactManagement(sock, rl);
    });
}

/**
 * Status Monitor Settings Handler
 */
async function handleStatusMonitorSettings(sock, rl) {
    console.log(`
    ================================
    👀 Status Monitor Settings 👀
    ================================
    1. Lihat Statistik Status
    2. Export Status Log
    3. Kembali ke Menu Utama
    ================================
    `);

    rl.question('Pilihan Anda (1-3): ', async (choice) => {
        switch (choice) {
            case '1':
                console.log(`
                Status yang Disukai: ${likedStatusIds.size}
                Status yang Diunduh: ${fs.readdirSync(STATUS_DOWNLOAD_DIR).length}
                Kontak yang Dimonitor: ${targetContacts.size}
                `);
                break;
            case '2':
                const logFile = `status_log_${moment().format('YYYYMMDD_HHmmss')}.json`;
                const logData = {
                    likedStatus: [...likedStatusIds],
                    monitoredContacts: [...targetContacts],
                    downloadedStatus: fs.readdirSync(STATUS_DOWNLOAD_DIR)
                };
                fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
                console.log(`${getTimestamp()} 📝 Log diekspor ke ${logFile}`);
                break;
            case '3':
                break;
        }
        showMenu(sock);
    });
}

/**
 * Enhanced WhatsApp connection function
 */
async function connectToWhatsApp() {
    try {
        console.log(`${getTimestamp()} 📱 Mempersiapkan koneksi WhatsApp...`);
        
        const sessionDir = 'auth_whatsapp';
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir);
            console.log(`${getTimestamp()} 📁 Membuat folder auth_whatsapp...`);
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        console.log(`${getTimestamp()} 🔄 Mengecek credentials...`);

        const sock = makeWASocket({
            printQRInTerminal: false,
            auth: state,
            logger,
            browser: ['Windows', 'Chrome', ''],
            connectTimeoutMs: CONNECTION_TIMEOUT,
            defaultQueryTimeoutMs: 60000
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if(qr) {
                console.log(`${getTimestamp()} 🔍 Scan QR Code berikut dengan WhatsApp Anda:`);
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 403;
                console.log(`${getTimestamp()} ❌ Koneksi terputus karena:`, lastDisconnect?.error?.output?.payload?.message || 'Unknown error');
                if (shouldReconnect) {
                    console.log(`${getTimestamp()} 🔄 Mencoba koneksi ulang...`);
                    setTimeout(connectToWhatsApp, 3000);
                }
            } else if (connection === 'connecting') {
                console.log(`${getTimestamp()} 🔄 Menghubungkan ke WhatsApp...`);
            } else if (connection === 'open') {
                console.log(`${getTimestamp()} ✅ Berhasil terhubung ke WhatsApp!`);
                showMenu(sock);
            }
        });

        // Add status update handler
        sock.ev.on('status.update', async (statuses) => {
            for (const status of Object.values(statuses)) {
                await handleStatus(sock, status);
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error(`${getTimestamp()} ❌ Terjadi kesalahan:`, error);
        console.log(`${getTimestamp()} 🔄 Mencoba koneksi ulang dalam 5 detik...`);
        setTimeout(connectToWhatsApp, 5000);
    }
}

// Original mass sending functions (kept unchanged for compatibility)
async function massSendToOneNumber(sock, targetNumber, message, repeatCount) {
    console.log(`${getTimestamp()} 🚀 Memulai pengiriman ke ${targetNumber} sebanyak ${repeatCount} kali...`);
    
    for (let i = 0; i < repeatCount; i++) {
        try {
            await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { text: message });
            console.log(`${getTimestamp()} ✅ Pesan ke-${i + 1} terkirim ke ${targetNumber}`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
        } catch (error) {
            console.error(`${getTimestamp()} ❌ Gagal mengirim pesan ke-${i + 1}:`, error.message);
        }
    }
    console.log(`${getTimestamp()} ✨ Pengiriman pesan selesai!`);
}

async function massSendToManyNumbers(sock, numbers, message) {
    console.log(`${getTimestamp()} 🚀 Memulai pengiriman ke ${numbers.length} nomor...`);
    
    for (const number of numbers) {
        try {
            await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
            console.log(`${getTimestamp()} ✅ Pesan terkirim ke ${number}`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
        } catch (error) {
            console.error(`${getTimestamp()} ❌ Gagal mengirim pesan ke ${number}:`, error.message);
        }
    }
    console.log(`${getTimestamp()} ✨ Pengiriman pesan selesai!`);
}

/**
 * Post operation menu handler
 */
function showPostOperationMenu(sock, rl) {
    console.log('\n================================');
    console.log('📋 Menu Pasca Operasi:');
    console.log('1️⃣ Kembali ke Menu Utama');
    console.log('0️⃣ Keluar Program');
    console.log('================================\n');

    rl.question('Pilihan Anda (0/1): ', (choice) => {
        switch (choice) {
            case '1':
                console.clear();
                showMenu(sock);
                break;
            case '0':
                console.log(`${getTimestamp()} 👋 Terima kasih telah menggunakan WNaa Bot!`);
                process.exit(0);
            default:
                console.log(`${getTimestamp()} ❌ Pilihan tidak valid!`);
                showPostOperationMenu(sock, rl);
        }
    });
}

/**
 * Single number input handler
 */
async function handleSingleNumberInput(sock, rl) {
    try {
        const targetNumber = await new Promise(resolve => {
            rl.question('📱 Masukkan nomor target (contoh: 628123456789): ', resolve);
        });

        const message = await new Promise(resolve => {
            rl.question('✍️ Masukkan pesan yang akan dikirim: ', resolve);
        });

        const repeatCount = await new Promise(resolve => {
            rl.question('🔄 Masukkan jumlah pengulangan: ', count => {
                resolve(parseInt(count));
            });
        });

        if (isNaN(repeatCount) || repeatCount <= 0) {
            throw new Error('Jumlah pengulangan harus berupa angka positif');
        }

        await massSendToOneNumber(sock, targetNumber, message, repeatCount);
        showPostOperationMenu(sock, rl);
    } catch (error) {
        console.error(`${getTimestamp()} ❌ Terjadi kesalahan:`, error.message);
        showPostOperationMenu(sock, rl);
    }
}

/**
 * Multiple numbers input handler
 */
async function handleMultipleNumbersInput(sock, rl) {
    try {
        const numbersInput = await new Promise(resolve => {
            rl.question('📱 Masukkan daftar nomor (pisahkan dengan koma, contoh: 628123456789,628987654321): ', resolve);
        });

        const numbers = numbersInput.split(',').map(num => num.trim());
        if (numbers.length === 0) {
            throw new Error('Daftar nomor tidak boleh kosong');
        }

        const message = await new Promise(resolve => {
            rl.question('✍️ Masukkan pesan yang akan dikirim: ', resolve);
        });

        await massSendToManyNumbers(sock, numbers, message);
        showPostOperationMenu(sock, rl);
    } catch (error) {
        console.error(`${getTimestamp()} ❌ Terjadi kesalahan:`, error.message);
        showPostOperationMenu(sock, rl);
    }
}

// Create required directories if they don't exist
function initializeDirectories() {
    const directories = [STATUS_DOWNLOAD_DIR];
    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`${getTimestamp()} 📁 Membuat direktori ${dir}`);
        }
    });
}

// Start the application
console.clear();
console.log(`${getTimestamp()} 🤖 Menginisialisasi WNaa Bot...`);
initializeDirectories();
connectToWhatsApp();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log(`${getTimestamp()} 👋 Menutup aplikasi...`);
    saveLikedStatusIds();
    process.exit(0);
});