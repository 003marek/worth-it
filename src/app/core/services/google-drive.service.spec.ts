import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DRIVE_BACKUP_FOLDER,
  DRIVE_BACKUP_FILE_NAME,
  GoogleDriveService,
} from './google-drive.service';

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  let mockList: ReturnType<typeof vi.fn>;
  let mockCreate: ReturnType<typeof vi.fn>;
  let mockClientInit: ReturnType<typeof vi.fn>;
  let mockClientLoad: ReturnType<typeof vi.fn>;
  let mockRequestAccessToken: ReturnType<typeof vi.fn>;
  let mockInitTokenClient: ReturnType<typeof vi.fn>;
  let tokenClientInstance: {
    callback: (resp: { access_token?: string; error?: string }) => void;
    requestAccessToken: ReturnType<typeof vi.fn>;
  };
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GoogleDriveService],
    });
    service = TestBed.inject(GoogleDriveService);

    mockList = vi.fn();
    mockCreate = vi.fn();
    mockClientInit = vi.fn().mockResolvedValue(undefined);
    mockClientLoad = vi.fn().mockResolvedValue(undefined);

    (globalThis as Record<string, unknown>)['gapi'] = {
      load: (_api: string, cb: () => void | Promise<void>) => {
        void cb();
      },
      client: {
        init: mockClientInit,
        load: mockClientLoad,
        drive: {
          files: {
            list: mockList,
            create: mockCreate,
          },
        },
      },
    };

    mockRequestAccessToken = vi.fn().mockImplementation(() => {
      tokenClientInstance.callback({ access_token: 'mock-access-token' });
    });

    mockInitTokenClient = vi.fn().mockImplementation(
      (config: {
        client_id: string;
        scope: string;
        callback: (resp: { access_token?: string; error?: string }) => void;
      }) => {
        tokenClientInstance = {
          callback: config.callback,
          requestAccessToken: mockRequestAccessToken,
        };
        return tokenClientInstance;
      }
    );

    (globalThis as Record<string, unknown>)['google'] = {
      accounts: {
        oauth2: {
          initTokenClient: mockInitTokenClient,
        },
      },
    };

    appendChildSpy = vi
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node: Node) => {
        const script = node as HTMLScriptElement;
        if (script.onload) {
          script.onload(new Event('load'));
        }
        return node;
      });

    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    appendChildSpy.mockRestore();
    globalThis.fetch = origFetch;
    delete (globalThis as Record<string, unknown>)['gapi'];
    delete (globalThis as Record<string, unknown>)['google'];
  });

  it('rejects init when clientId is empty', async () => {
    await expect(service.init('')).rejects.toThrow('Google Client ID is required');
    await expect(service.init('   ')).rejects.toThrow('Google Client ID is required');
  });

  it('loads gapi and gis scripts and initializes Drive v3 and tokenClient', async () => {
    await service.init('my-client-id.apps.googleusercontent.com');

    expect(appendChildSpy).toHaveBeenCalledTimes(2);
    expect(mockClientInit).toHaveBeenCalledWith({});
    expect(mockClientLoad).toHaveBeenCalledWith('drive', 'v3');
    expect(mockInitTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'my-client-id.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file',
      })
    );
  });

  it('creates backup folder and uploads new worth-it-backup.json when neither exists', async () => {
    await service.init('client-123');

    // First list call: findFolder -> empty
    // Second list call: findFile -> empty
    mockList
      .mockResolvedValueOnce({ result: { files: [] } })
      .mockResolvedValueOnce({ result: { files: [] } });

    mockCreate.mockResolvedValueOnce({ result: { id: 'folder-abc' } });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'file-xyz' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await service.syncData('{"version":2}', DEFAULT_DRIVE_BACKUP_FOLDER);

    expect(mockRequestAccessToken).toHaveBeenCalledWith({ prompt: '' });
    expect(mockCreate).toHaveBeenCalledWith({
      resource: {
        name: DEFAULT_DRIVE_BACKUP_FOLDER,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-access-token',
        }),
      })
    );
    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).toContain(DRIVE_BACKUP_FILE_NAME);
    expect(body).toContain('{"version":2}');
  });

  it('updates existing worth-it-backup.json via PATCH when folder and file exist', async () => {
    await service.init('client-123');

    mockList
      .mockResolvedValueOnce({
        result: { files: [{ id: 'existing-folder', name: 'WorthIt Backups' }] },
      })
      .mockResolvedValueOnce({
        result: { files: [{ id: 'existing-file', name: DRIVE_BACKUP_FILE_NAME }] },
      });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await service.syncData('{"version":2,"updated":true}', 'WorthIt Backups');

    expect(mockCreate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/upload/drive/v3/files/existing-file?uploadType=media',
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer mock-access-token',
          'Content-Type': 'application/json',
        },
        body: '{"version":2,"updated":true}',
      })
    );
  });

  it('imports backup JSON from Google Drive when folder and file exist', async () => {
    await service.init('client-123');

    mockList
      .mockResolvedValueOnce({
        result: { files: [{ id: 'folder-1', name: 'WorthIt Backups' }] },
      })
      .mockResolvedValueOnce({
        result: { files: [{ id: 'file-1', name: DRIVE_BACKUP_FILE_NAME }] },
      });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"version":2,"appName":"Worth It"}',
    }) as unknown as typeof globalThis.fetch;

    const result = await service.importData('WorthIt Backups');
    expect(result).toBe('{"version":2,"appName":"Worth It"}');
  });

  it('throws clear errors when folder or backup file is missing on import', async () => {
    await service.init('client-123');

    mockList.mockResolvedValueOnce({ result: { files: [] } });
    await expect(service.importData('Missing Folder')).rejects.toThrow(
      'Folder "Missing Folder" not found on Google Drive'
    );

    mockList
      .mockResolvedValueOnce({
        result: { files: [{ id: 'folder-1', name: 'WorthIt Backups' }] },
      })
      .mockResolvedValueOnce({ result: { files: [] } });

    await expect(service.importData('WorthIt Backups')).rejects.toThrow(
      `Backup file "${DRIVE_BACKUP_FILE_NAME}" not found in folder "WorthIt Backups"`
    );
  });
});
