"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToGoogleDrive = void 0;
const googleapis_1 = require("googleapis");
const stream_1 = require("stream");
const streamToPassThrough = (stream) => {
    const passThrough = new stream_1.PassThrough();
    stream.on('data', (chunk) => passThrough.write(chunk));
    stream.on('end', () => passThrough.end());
    stream.on('error', (error) => passThrough.destroy(error));
    return passThrough;
};
const getDriveAuth = async () => {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
        const credentials = JSON.parse(serviceAccountJson);
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        return auth;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const auth = new googleapis_1.google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        return auth;
    }
    throw new Error('Credenciais do Google Drive não configuradas');
};
const uploadToGoogleDrive = async ({ stream, filename, mimeType, folderId }) => {
    const auth = await getDriveAuth();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    if (!accessToken.token) {
        throw new Error('Não foi possível obter token de acesso do Google Drive');
    }
    const initResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json; charset=utf-8',
            'X-Upload-Content-Type': mimeType,
            'X-Upload-Content-Length': '0',
        },
        body: JSON.stringify({
            name: filename,
            mimeType,
            parents: folderId ? [folderId] : undefined,
        }),
    });
    if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`Falha ao iniciar upload no Google Drive: ${errorText}`);
    }
    const uploadUrl = initResponse.headers.get('location');
    if (!uploadUrl) {
        throw new Error('Google Drive não retornou URL de upload resumável');
    }
    const uploadStream = streamToPassThrough(stream);
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken.token}`,
            'Content-Type': mimeType,
        },
        body: uploadStream,
    });
    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Falha ao completar upload no Google Drive: ${errorText}`);
    }
    const uploadedFile = (await uploadResponse.json());
    if (!uploadedFile.id) {
        throw new Error('Google Drive não retornou o identificador do arquivo enviado');
    }
    return {
        fileId: uploadedFile.id,
        webViewLink: uploadedFile.webViewLink ?? '',
        mimeType: uploadedFile.mimeType ?? mimeType,
    };
};
exports.uploadToGoogleDrive = uploadToGoogleDrive;
