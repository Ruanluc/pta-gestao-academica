// Variáveis mínimas para carregar os módulos compilados sem depender do .env local
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
process.env.DATABASE_URL = process.env.DATABASE_URL_TESTE || 'postgresql://teste:teste@localhost:5432/teste';
process.env.REDIS_URL = '';
process.env.GOOGLE_DRIVE_FOLDER_ID = '';
process.env.SMTP_HOST = '';
process.env.CADEMI_API_URL = '';
process.env.CADEMI_API_TOKEN = '';
