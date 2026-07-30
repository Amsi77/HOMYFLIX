'use strict';

/**
 * עטיפה דקה סביב whatsapp-web.js.
 * אחראית על: התחברות (QR), שמירת מצב החיבור, ושליחת הודעות.
 *
 * החיבור הוא "פשוט" – סורקים QR פעם אחת מהוואטאפ בנייד (מכשירים מקושרים),
 * ומאז הסשן נשמר מקומית בתיקיית .wwebjs_auth ואין צורך לסרוק שוב.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

// מצב פנימי שנחשף החוצה דרך getStatus()
const state = {
  status: 'starting', // starting | qr | authenticated | ready | disconnected
  qrDataUrl: null, // תמונת ה-QR כ-data URL להצגה בדפדפן
  qrString: null, // מחרוזת ה-QR הגולמית
  lastError: null,
  me: null, // המספר שאליו מחוברים
};

let client = null;

// קולבק שמופעל כשמגיעה הודעה נכנסת (נקבע מבחוץ ב-init)
let onIncoming = () => {};

function buildClient() {
  const puppeteerOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  };

  // מאפשר להצביע על Chromium מותקן אם whatsapp-web.js לא מוצא אחד לבד
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // dataPath ניתן להגדרה כדי לשמור את סשן הוואטאפ על דיסק קבוע בענן
  const localAuthOpts = { clientId: 'homyflix' };
  if (process.env.WWEBJS_DATA_PATH) {
    localAuthOpts.dataPath = process.env.WWEBJS_DATA_PATH;
  }

  return new Client({
    authStrategy: new LocalAuth(localAuthOpts),
    puppeteer: puppeteerOpts,
  });
}

function wireEvents(c) {
  c.on('qr', async (qr) => {
    state.status = 'qr';
    state.qrString = qr;
    try {
      state.qrDataUrl = await qrcode.toDataURL(qr, { margin: 1, width: 320 });
    } catch (err) {
      state.qrDataUrl = null;
    }
    console.log('[whatsapp] קוד QR חדש זמין – פתח /admin וסרוק אותו מהוואטאפ בנייד.');
  });

  c.on('authenticated', () => {
    state.status = 'authenticated';
    state.qrDataUrl = null;
    state.qrString = null;
    console.log('[whatsapp] אומת בהצלחה.');
  });

  c.on('auth_failure', (msg) => {
    state.status = 'disconnected';
    state.lastError = String(msg);
    console.error('[whatsapp] כשל באימות:', msg);
  });

  c.on('ready', () => {
    state.status = 'ready';
    state.qrDataUrl = null;
    state.qrString = null;
    state.me = c.info && c.info.wid ? c.info.wid.user : null;
    console.log('[whatsapp] הבוט מוכן ✅ מחובר כ:', state.me);
  });

  c.on('disconnected', (reason) => {
    state.status = 'disconnected';
    state.lastError = String(reason);
    console.warn('[whatsapp] התנתק:', reason);
    // ניסיון התחברות מחדש
    setTimeout(() => {
      try {
        c.initialize();
      } catch (err) {
        console.error('[whatsapp] כשל באתחול מחדש:', err.message);
      }
    }, 5000);
  });

  c.on('message', async (message) => {
    try {
      await onIncoming(message, c);
    } catch (err) {
      console.error('[whatsapp] שגיאה בטיפול בהודעה נכנסת:', err.message);
    }
  });
}

/**
 * אתחול הבוט.
 * @param {(message, client) => Promise<void>} incomingHandler
 */
function init(incomingHandler) {
  if (typeof incomingHandler === 'function') {
    onIncoming = incomingHandler;
  }
  client = buildClient();
  wireEvents(client);
  client.initialize().catch((err) => {
    state.status = 'disconnected';
    state.lastError = err.message;
    console.error('[whatsapp] כשל באתחול:', err.message);
  });
  return client;
}

/** המרת מספר טלפון ל-chatId של וואטאפ (פורמט: <number>@c.us) */
function toChatId(number) {
  const digits = String(number || '').replace(/[^0-9]/g, '');
  return `${digits}@c.us`;
}

/**
 * שליחת הודעת טקסט.
 * @param {string} number מספר בפורמט בינלאומי (ספרות בלבד)
 * @param {string} text
 */
async function sendText(number, text) {
  if (!client || state.status !== 'ready') {
    throw new Error('הבוט עדיין לא מחובר לוואטאפ. סרוק QR ב-/admin.');
  }
  const chatId = toChatId(number);
  return client.sendMessage(chatId, text);
}

function getStatus() {
  return {
    status: state.status,
    connected: state.status === 'ready',
    me: state.me,
    qrDataUrl: state.qrDataUrl,
    lastError: state.lastError,
  };
}

module.exports = { init, sendText, getStatus, toChatId };
