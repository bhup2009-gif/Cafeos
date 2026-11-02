// Build-time configuration check. Schema provisioning is a separate operation.
const errors=[];
if(!process.env.DATABASE_URL)errors.push('DATABASE_URL is missing');
if(!process.env.SUPABASE_CA_CERT?.includes('BEGIN CERTIFICATE'))errors.push('SUPABASE_CA_CERT is missing');
try {const url=new URL(process.env.DATABASE_URL||'');if(!['postgres:','postgresql:'].includes(url.protocol))errors.push('DATABASE_URL must use PostgreSQL');if(!url.password || url.password.includes('YOUR-PASSWORD'))errors.push('DATABASE_URL needs the real database password');}catch{errors.push('DATABASE_URL is invalid');}
if(errors.length){console.error('Cloud configuration incomplete: '+errors.join('; ')+'. See docs/deployment.md.');process.exitCode=1;}else console.log('Cloud configuration present. No database changes run during build.');
