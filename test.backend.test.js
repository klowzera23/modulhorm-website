const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server.js'], {
      cwd: path.join(__dirname),
      env: { ...process.env, PORT: '4100', DB_FILE: ':memory:' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Server start timeout: ' + stderr));
    }, 15000);

    child.stdout.on('data', () => {
      // wait until server is ready; child prints line when ready
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('spawn', async () => {
      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          const response = await fetch('http://127.0.0.1:4100/health');
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      clearTimeout(timer);
      if (!ready) {
        child.kill();
        reject(new Error('Server did not become ready: ' + stderr));
        return;
      }
      resolve(child);
    });
  });
}

test('POST /api/contact guarda el mensaje y responde ok', async () => {
  const child = await startServer();

  try {
    const response = await fetch('http://127.0.0.1:4100/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Ana',
        telefono: '3515551234',
        email: 'ana@example.com',
        tipoProyecto: 'Vivienda',
        mensaje: 'Necesito presupuesto'
      })
    });

    const result = await response.json();
    assert.equal(response.status, 201, 'Expected status 201');
    assert.equal(result.ok, true);
    assert.equal(typeof result.id, 'number');

    const listResponse = await fetch('http://127.0.0.1:4100/api/contacts');
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].nombre, 'Ana');
  } finally {
    child.kill();
  }
});
