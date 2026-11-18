import { Injectable } from '@angular/core';

export const DEFAULT_DRIVE_BACKUP_FOLDER = 'WorthIt Backups';
export const DRIVE_BACKUP_FILE_NAME = 'worth-it-backup.json';

interface DriveFileSummary {
  id: string;
  name: string;
}

interface DriveFilesListResponse {
  result: {
    files?: DriveFileSummary[];
  };
}

interface DriveFileCreateResponse {
  result: {
    id: string;
  };
}

interface GapiDriveFiles {
  list(params: { q: string; fields: string; spaces: string }): Promise<DriveFilesListResponse>;
  create(params: {
    resource: { name: string; mimeType: string };
    fields: string;
  }): Promise<DriveFileCreateResponse>;
}

interface GapiClient {
  init(config: Record<string, unknown>): Promise<void>;
  load(api: string, version: string): Promise<void>;
  drive: {
    files: GapiDriveFiles;
  };
}

interface GapiGlobal {
  load(api: string, callback: () => void | Promise<void>): void;
  client: GapiClient;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenClient {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken(overrideConfig: { prompt: string }): void;
}

interface GoogleAccountsGlobal {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
      }): GoogleTokenClient;
    };
  };
}

declare const gapi: GapiGlobal;
declare const google: GoogleAccountsGlobal;

@Injectable({
  providedIn: 'root',
})
export class GoogleDriveService {
  private gapiLoaded = false;
  private gisLoaded = false;
  private gapiInitialized = false;
  private initializedClientId: string | null = null;
  private tokenClient: GoogleTokenClient | null = null;
  private accessToken: string | null = null;

  async init(clientId: string): Promise<void> {
    const trimmed = clientId.trim();
    if (!trimmed) {
      throw new Error('Google Client ID is required');
    }

    await Promise.all([this.loadGapiScript(), this.loadGisScript()]);
    if (!this.gapiInitialized) {
      await this.initializeGapi();
      this.gapiInitialized = true;
    }
    if (this.initializedClientId !== trimmed || !this.tokenClient) {
      this.initializeGis(trimmed);
      this.initializedClientId = trimmed;
    }
  }

  private loadGapiScript(): Promise<void> {
    if (this.gapiLoaded) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.gapiLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Google API script'));
      document.head.appendChild(script);
    });
  }

  private loadGisScript(): Promise<void> {
    if (this.gisLoaded) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.gisLoaded = true;
        resolve();
      };
      script.onerror = () =>
        reject(new Error('Failed to load Google Identity Services script'));
      document.head.appendChild(script);
    });
  }

  private initializeGapi(): Promise<void> {
    return new Promise((resolve) => {
      gapi.load('client', async () => {
        await gapi.client.init({});
        await gapi.client.load('drive', 'v3');
        resolve();
      });
    });
  }

  private initializeGis(clientId: string): void {
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response: GoogleTokenResponse) => {
        if (response.error) {
          throw new Error(response.error);
        }
        this.accessToken = response.access_token ?? null;
      },
    });
  }

  authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        reject(new Error('Token client not initialized. Call init() first.'));
        return;
      }

      const client = this.tokenClient;
      const originalCallback = client.callback;
      client.callback = (response: GoogleTokenResponse) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          this.accessToken = response.access_token ?? null;
          resolve();
        }
        client.callback = originalCallback;
      };

      client.requestAccessToken({ prompt: '' });
    });
  }

  async syncData(jsonData: string, folderName: string): Promise<void> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const resolvedFolderName = folderName.trim() || DEFAULT_DRIVE_BACKUP_FOLDER;

    let folderId = await this.findFolder(resolvedFolderName);
    if (!folderId) {
      folderId = await this.createFolder(resolvedFolderName);
    }

    const fileId = await this.findFile(DRIVE_BACKUP_FILE_NAME, folderId);

    if (fileId) {
      await this.updateFile(fileId, jsonData);
    } else {
      await this.uploadFile(DRIVE_BACKUP_FILE_NAME, folderId, jsonData);
    }
  }

  private escapeDriveQueryLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private async findFolder(name: string): Promise<string | null> {
    const escaped = this.escapeDriveQueryLiteral(name);
    const response = await gapi.client.drive.files.list({
      q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const folders = response.result.files;
    return folders && folders.length > 0 ? folders[0].id : null;
  }

  private async createFolder(name: string): Promise<string> {
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };

    const response = await gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });

    return response.result.id;
  }

  private async findFile(name: string, parentId: string): Promise<string | null> {
    const escapedName = this.escapeDriveQueryLiteral(name);
    const escapedParent = this.escapeDriveQueryLiteral(parentId);
    const response = await gapi.client.drive.files.list({
      q: `name='${escapedName}' and '${escapedParent}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const files = response.result.files;
    return files && files.length > 0 ? files[0].id : null;
  }

  private async uploadFile(name: string, parentId: string, content: string): Promise<string> {
    const boundary = '-------314159265358979323846';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelim = '\r\n--' + boundary + '--';

    const metadata = {
      name,
      mimeType: 'application/json',
      parents: [parentId],
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      content +
      closeDelim;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.accessToken = null;
      }
      throw new Error(`Failed to upload file: ${response.statusText || response.status}`);
    }

    const result = (await response.json()) as { id: string };
    return result.id;
  }

  private async updateFile(fileId: string, content: string): Promise<void> {
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: content,
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.accessToken = null;
      }
      throw new Error(`Failed to update file: ${response.statusText || response.status}`);
    }
  }

  async importData(folderName: string): Promise<string> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const resolvedFolderName = folderName.trim() || DEFAULT_DRIVE_BACKUP_FOLDER;

    const folderId = await this.findFolder(resolvedFolderName);
    if (!folderId) {
      throw new Error(`Folder "${resolvedFolderName}" not found on Google Drive`);
    }

    const fileId = await this.findFile(DRIVE_BACKUP_FILE_NAME, folderId);
    if (!fileId) {
      throw new Error(
        `Backup file "${DRIVE_BACKUP_FILE_NAME}" not found in folder "${resolvedFolderName}"`
      );
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.accessToken = null;
      }
      throw new Error(`Failed to download file: ${response.statusText || response.status}`);
    }

    return await response.text();
  }
}
