#!/usr/bin/env node
// setup-stripe.js — Configuración automática de Stripe para Curio by Fable
// Uso: node setup-stripe.js <sk_test_...> <pk_test_...>
//
// Este script:
// 1. Actualiza public/config.js con la clave publicable
// 2. Actualiza .env.local con ambas claves
// 3. Añade las variables de entorno a Vercel (production + preview + development)
// 4. Hace commit y push de config.js actualizado
// 5. Muestra las instrucciones para la migración de Supabase
'use strict';

const { execSync }  = require('child_process');
const fs            = require('fs');
const path          = require('path');

const [, , SK, PK] = process.argv;

if (!SK || !PK) {
  console.error(`
Uso: node setup-stripe.js <sk_test_...> <pk_test_...>

Obtén las claves en: https://dashboard.stripe.com/test/apikeys
  - "Secret key"      → sk_test_...
  - "Publishable key" → pk_test_...

Ejemplo:
  node setup-stripe.js sk_test_xxxxx pk_test_xxxxx
`);
  process.exit(1);
}

if (!SK.startsWith('sk_')) {
  console.error('Error: La clave secreta debe empezar con sk_test_ o sk_live_');
  process.exit(1);
}
if (!PK.startsWith('pk_')) {
  console.error('Error: La clave publicable debe empezar con pk_test_ o pk_live_');
  process.exit(1);
}

const isTest = SK.startsWith('sk_test_');
console.log(`\n🔑 Configurando Stripe ${isTest ? '(modo TEST)' : '(modo LIVE)'}...\n`);

// ── 1. Actualizar public/config.js ─────────────────────────
const configPath = path.join(__dirname, 'public', 'config.js');
let config = fs.readFileSync(configPath, 'utf8');
config = config.replace(
  /stripePublishableKey:\s*'[^']*'/,
  `stripePublishableKey: '${PK}'`
);
fs.writeFileSync(configPath, config, 'utf8');
console.log('✅ public/config.js actualizado con la clave publicable');

// ── 2. Actualizar .env.local ──────────────────────────────
const envPath = path.join(__dirname, '.env.local');
let envContent = fs.readFileSync(envPath, 'utf8');

if (envContent.includes('STRIPE_SECRET_KEY=')) {
  envContent = envContent.replace(/^STRIPE_SECRET_KEY=.*/m, `STRIPE_SECRET_KEY=${SK}`);
} else {
  envContent += `\nSTRIPE_SECRET_KEY=${SK}`;
}

if (envContent.includes('STRIPE_PUBLISHABLE_KEY=')) {
  envContent = envContent.replace(/^STRIPE_PUBLISHABLE_KEY=.*/m, `STRIPE_PUBLISHABLE_KEY=${PK}`);
} else {
  envContent += `\nSTRIPE_PUBLISHABLE_KEY=${PK}`;
}

fs.writeFileSync(envPath, envContent, 'utf8');
console.log('✅ .env.local actualizado con ambas claves Stripe');

// ── 3. Añadir variables de entorno a Vercel ───────────────
function vercelEnvAdd(key, value) {
  try {
    // Remove existing first
    execSync(`echo "" | vercel env rm ${key} production --yes 2>/dev/null || true`, { stdio: 'pipe' });
    execSync(`echo "" | vercel env rm ${key} preview --yes 2>/dev/null || true`, { stdio: 'pipe' });
    execSync(`echo "" | vercel env rm ${key} development --yes 2>/dev/null || true`, { stdio: 'pipe' });
  } catch (_) {}

  try {
    // Add to all environments
    const cmd = `echo "${value}" | vercel env add ${key} production preview development`;
    execSync(cmd, { stdio: 'pipe', cwd: __dirname });
    console.log(`✅ Vercel env: ${key} añadida`);
  } catch (e) {
    console.error(`❌ Error añadiendo ${key} a Vercel:`, e.message.split('\n')[0]);
    console.log(`   Añádela manualmente: vercel env add ${key}`);
  }
}

console.log('\n⏳ Añadiendo variables de entorno a Vercel...');
vercelEnvAdd('STRIPE_SECRET_KEY', SK);
vercelEnvAdd('STRIPE_PUBLISHABLE_KEY', PK);

// ── 4. Commit y push de config.js ─────────────────────────
try {
  execSync('git add public/config.js', { cwd: __dirname, stdio: 'pipe' });
  execSync(`git commit -m "config: stripe publishable key actualizada (${isTest ? 'test' : 'live'})"`, {
    cwd: __dirname,
    stdio: 'pipe',
  });
  execSync('git push', { cwd: __dirname, stdio: 'pipe' });
  console.log('\n✅ Cambios en config.js commiteados y pusheados a GitHub');
} catch (e) {
  console.log('\n⚠️  No se pudo hacer commit automático:', e.message.split('\n')[0]);
  console.log('   Ejecuta: git add public/config.js && git commit -m "config: stripe key" && git push');
}

// ── 5. Instrucciones Supabase ─────────────────────────────
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Stripe configurado correctamente

⚠️  FALTA: Exponer schema 'curio' en Supabase (2 pasos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Ve a: https://supabase.com/dashboard/project/gboguglxgvdsvzprtigj/settings/api
   → Busca "Exposed schemas" (abajo en la página)
   → Haz clic en el campo y escribe: curio
   → Haz clic en "Save"

2. En el mismo Supabase Dashboard, ve al SQL Editor y ejecuta:
   https://supabase.com/dashboard/project/gboguglxgvdsvzprtigj/sql/new

   ALTER TABLE curio.orders
     ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
     ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

   DO $$ BEGIN
     ALTER TYPE curio.order_status ADD VALUE IF NOT EXISTS 'esperando_pago';
   EXCEPTION WHEN others THEN NULL; END $$;

Después de estos 2 pasos, el checkout con Stripe funcionará.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧪 Tarjeta de prueba Stripe: 4242 4242 4242 4242
   Fecha: cualquiera futura · CVC: cualquiera · ZIP: cualquiera

`);
