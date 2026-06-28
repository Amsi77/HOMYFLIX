'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const store = require('./src/store');
const whatsapp = require('./src/whatsapp');

const PORT = process.env.PORT || 3000;
const OWNER_NUMBER = process.env.OWNER_NUMBER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'homyflix123';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- העלאת תמונות ----
// UPLOAD_DIR ניתן להגדרה דרך משתנה סביבה (לפריסה בענן עם דיסק קבוע)
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('ניתן להעלות תמונות בלבד'));
  },
});

// ---- אימות פשוט לעמוד הניהול ----
// כותרת x-admin-password או query ?pw= מאפשרים גישה ל-API הניהולי.
function requireAdmin(req, res, next) {
  const pw = req.get('x-admin-password') || req.query.pw || (req.body && req.body.pw);
  if (pw && pw === ADMIN_PASSWORD) return next();
  return res.status(401).json({ ok: false, error: 'סיסמת ניהול שגויה' });
}

// =================== API ===================

// סטטוס הבוט + QR לחיבור
app.get('/api/status', (req, res) => {
  res.json(whatsapp.getStatus());
});

// רשימת פוסטים (ציבורי)
app.get('/api/posts', (req, res) => {
  res.json(store.getPosts());
});

// יצירת פוסט חדש (ניהולי)
app.post('/api/posts', requireAdmin, upload.single('image'), (req, res) => {
  const { title, description, price } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ ok: false, error: 'חובה למלא כותרת' });
  }
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const post = store.addPost({ title, description, price, image });
  res.json({ ok: true, post });
});

// מחיקת פוסט (ניהולי)
app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  store.deletePost(req.params.id);
  res.json({ ok: true });
});

// רשימת לידים (ניהולי)
app.get('/api/leads', requireAdmin, (req, res) => {
  res.json(store.getLeads());
});

// יצירת ליד (ציבורי) – זה הלב: שולח לך הודעת וואטאפ
app.post('/api/leads', async (req, res) => {
  const { postId, name, phone, message } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ ok: false, error: 'חובה למלא שם וטלפון' });
  }

  const post = postId ? store.getPost(postId) : null;
  const lead = store.addLead({
    postId: postId || null,
    postTitle: post ? post.title : null,
    name,
    phone,
    message,
  });

  // שליחת הליד אליך בוואטאפ
  let whatsappSent = false;
  let whatsappError = null;
  if (OWNER_NUMBER) {
    const text = [
      '🔔 *ליד חדש מ-HOMYFLIX*',
      post ? `📌 פוסט: ${post.title}` : null,
      `👤 שם: ${lead.name}`,
      `📞 טלפון: ${lead.phone}`,
      lead.message ? `💬 הודעה: ${lead.message}` : null,
      '',
      `🕒 ${new Date(lead.createdAt).toLocaleString('he-IL')}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await whatsapp.sendText(OWNER_NUMBER, text);
      whatsappSent = true;
    } catch (err) {
      whatsappError = err.message;
      console.error('[leads] לא הצלחתי לשלוח ליד בוואטאפ:', err.message);
    }
  } else {
    whatsappError = 'OWNER_NUMBER לא הוגדר ב-.env';
  }

  res.json({ ok: true, lead, whatsappSent, whatsappError });
});

// =================== עמודים ===================
// תמונות שהועלו (יכול להיות מחוץ ל-public בענן עם דיסק קבוע)
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// טיפול בשגיאות multer וכו'
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(400).json({ ok: false, error: err.message });
});

// =================== בוט וואטאפ ===================
// טיפול בהודעות נכנסות: מענה אוטומטי + העברה אליך.
async function handleIncoming(message, client) {
  // מתעלמים מהודעות סטטוס וקבוצות
  if (message.from === 'status@broadcast' || message.from.endsWith('@g.us')) return;

  const body = (message.body || '').trim().toLowerCase();

  // פקודות בסיסיות
  if (['היי', 'שלום', 'hi', 'hello', 'תפריט', 'menu', 'start'].includes(body)) {
    const posts = store.getPosts().slice(0, 5);
    const lines = ['👋 ברוך הבא ל-*HOMYFLIX*!', ''];
    if (posts.length) {
      lines.push('הפוסטים האחרונים שלנו:');
      posts.forEach((p, i) => {
        lines.push(`${i + 1}. ${p.title}${p.price ? ` – ${p.price}` : ''}`);
      });
      lines.push('', 'כתוב את שמך כדי שניצור איתך קשר 🙂');
    } else {
      lines.push('עדיין אין פוסטים פעילים. נשמח אם תשאיר פרטים ונחזור אליך.');
    }
    await message.reply(lines.join('\n'));
    return;
  }

  // כל הודעה אחרת – נשמרת כליד ומועברת אליך
  const contact = await message.getContact().catch(() => null);
  const senderName = (contact && (contact.pushname || contact.name)) || 'לא ידוע';
  const senderNumber = message.from.replace('@c.us', '');

  store.addLead({
    postId: null,
    postTitle: 'הודעה ישירה בוואטאפ',
    name: senderName,
    phone: senderNumber,
    message: message.body,
  });

  // מענה אוטומטי לפונה
  await message.reply('תודה! קיבלנו את ההודעה ונחזור אליך בהקדם 🙏');

  // העברה אליך (אם זה לא אתה ששלחת)
  if (OWNER_NUMBER && senderNumber !== OWNER_NUMBER) {
    const fwd = [
      '📩 *הודעה חדשה בבוט HOMYFLIX*',
      `👤 ${senderName} (${senderNumber})`,
      `💬 ${message.body}`,
    ].join('\n');
    try {
      await whatsapp.sendText(OWNER_NUMBER, fwd);
    } catch (err) {
      // המשך גם אם נכשל
    }
  }
}

// =================== הפעלה ===================
app.listen(PORT, () => {
  console.log(`\n🎬 HOMYFLIX רץ על http://localhost:${PORT}`);
  console.log(`   📋 עמוד ניהול:  http://localhost:${PORT}/admin`);
  console.log(`   🌐 קטלוג ציבורי: http://localhost:${PORT}/`);
  if (!OWNER_NUMBER) {
    console.warn('\n⚠️  OWNER_NUMBER לא הוגדר ב-.env – לידים לא יישלחו לוואטאפ.');
  }
  console.log('\n📱 מאתחל את בוט הוואטאפ... פתח /admin כדי לסרוק QR.\n');
});

whatsapp.init(handleIncoming);
