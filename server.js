const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'modulhorm.db');

app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error opening DB:', err.message);
    process.exit(1);
  }
});

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || 'modulhorm@gmail.com';
  const pass = process.env.SMTP_PASS || 'feryhugo';

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

async function sendContactEmail(data) {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('SMTP no configurado. El mensaje se guardó pero no se envió por email.');
    return;
  }

  const to = process.env.CONTACT_TO || 'modulhorm6@gmail.com';
  const subject = `Nuevo contacto desde la web - ${data.tipoProyecto}`;
  const html = `
    <h2>Nuevo mensaje de contacto</h2>
    <p><strong>Nombre:</strong> ${data.nombre}</p>
    <p><strong>Email:</strong> ${data.email}</p>
    <p><strong>Teléfono:</strong> ${data.telefono || '-'}</p>
    <p><strong>Tipo de proyecto:</strong> ${data.tipoProyecto}</p>
    <p><strong>Mensaje:</strong> ${data.mensaje || '-'}</p>
    <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-AR')}</p>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'modulhorm6@gmail.com',
    to,
    subject,
    html
  });
}

function initDb() {
  return new Promise((resolve, reject) => {
    db.exec(
      `
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT,
        email TEXT NOT NULL,
        tipoProyecto TEXT NOT NULL,
        mensaje TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      `,
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'ok' });
});

app.post('/api/contact', async (req, res) => {
  try {
    const { nombre, telefono = '', email, tipoProyecto, mensaje = '' } = req.body || {};

    if (!nombre || !email || !tipoProyecto) {
      return res.status(400).json({ ok: false, error: 'Nombre, email y tipo de proyecto son obligatorios.' });
    }

    const result = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO contacts (nombre, telefono, email, tipoProyecto, mensaje) VALUES (?, ?, ?, ?, ?)',
        [nombre, telefono, email, tipoProyecto, mensaje],
        function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID });
        }
      );
    });

    try {
      await sendContactEmail({ nombre, telefono, email, tipoProyecto, mensaje });
    } catch (mailErr) {
      console.error('Error sending email:', mailErr);
    }

    res.status(201).json({ ok: true, id: result.id, message: 'Contacto guardado correctamente.' });
  } catch (error) {
    console.error('Error saving contact:', error);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el contacto.' });
  }
});

app.get('/api/contacts', async (_req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM contacts ORDER BY id DESC', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    res.json(rows);
  } catch (error) {
    console.error('Error listing contacts:', error);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar los contactos.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Servidor iniciado en http://localhost:${port}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (port < 3100) {
          console.warn(`Puerto ${port} ocupado. Reintentando en ${port + 1}...`);
          if (server.listening) {
            server.close(() => startServer(port + 1).then(resolve, reject));
          } else {
            startServer(port + 1).then(resolve, reject);
          }
          return;
        }
      }
      reject(err);
    });
  });
}

async function start() {
  await initDb();
  await startServer(Number(PORT) || 3000);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
