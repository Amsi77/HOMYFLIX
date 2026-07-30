'use strict';

/**
 * אחסון פשוט מבוסס קבצי JSON (ללא מסד נתונים חיצוני – "פשוט").
 * שומר פוסטים ולידים בתיקיית data/.
 */

const fs = require('fs');
const path = require('path');

// DATA_DIR ניתן להגדרה דרך משתנה סביבה (לפריסה בענן עם דיסק קבוע)
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(POSTS_FILE)) fs.writeFileSync(POSTS_FILE, '[]');
  if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]');
}

function readJson(file) {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return [];
  }
}

function writeJson(file, data) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- פוסטים ----

function getPosts() {
  return readJson(POSTS_FILE).sort((a, b) => b.createdAt - a.createdAt);
}

function getPost(postId) {
  return getPosts().find((p) => p.id === postId) || null;
}

function addPost({ title, description, price, image }) {
  const posts = readJson(POSTS_FILE);
  const post = {
    id: id(),
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    price: String(price || '').trim(),
    image: image || null,
    createdAt: Date.now(),
  };
  posts.push(post);
  writeJson(POSTS_FILE, posts);
  return post;
}

function deletePost(postId) {
  const posts = readJson(POSTS_FILE).filter((p) => p.id !== postId);
  writeJson(POSTS_FILE, posts);
}

// ---- לידים ----

function getLeads() {
  return readJson(LEADS_FILE).sort((a, b) => b.createdAt - a.createdAt);
}

function addLead({ postId, postTitle, name, phone, message }) {
  const leads = readJson(LEADS_FILE);
  const lead = {
    id: id(),
    postId: postId || null,
    postTitle: postTitle || null,
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    message: String(message || '').trim(),
    createdAt: Date.now(),
  };
  leads.push(lead);
  writeJson(LEADS_FILE, leads);
  return lead;
}

module.exports = {
  getPosts,
  getPost,
  addPost,
  deletePost,
  getLeads,
  addLead,
};
