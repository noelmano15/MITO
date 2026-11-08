import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  UserAccount,
  VideoContent,
  CategoryItem,
  EpisodeItem,
  MediaAsset,
  GameItem,
  GameQuestionFull,
  PlaybackProgressRecord,
  MultiplayerRoom,
  LeaderboardEntry,
  AchievementDefinition,
  AuditLogEntry,
  DeviceActivityItem,
  BannedDeviceRecord,
  SupportTicket,
} from '../types/mito';
import { DEFAULT_ACHIEVEMENTS } from '../utils/gameScoring';
import { hashAccessCode, maskAccessCode } from '../utils/accessCode';

const PEPPER = 'mito-heritage-default-server-pepper-2026';

export const DEFAULT_GOOGLE_DRIVE_FOLDER_ID = '1nuao4j4D1a2ZO6cN_WoHBwWOPMbmFbq5';
export const DEFAULT_GOOGLE_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1nuao4j4D1a2ZO6cN_WoHBwWOPMbmFbq5?usp=drive_link';

// Dedicated Firestore project config so Google Drive OAuth in firebase-applet-config.json never conflicts with Firestore persistence
const FIRESTORE_PROJECT_CONFIG = {
  projectId: 'gen-lang-client-0281466159',
  appId: '1:341078202353:web:893c0531eb00e82beed650',
  apiKey: 'AIzaSyD929veYoOLvKTZP4L0id76T1QGBiX4qpA',
  authDomain: 'gen-lang-client-0281466159.firebaseapp.com',
  storageBucket: 'gen-lang-client-0281466159.firebasestorage.app',
  messagingSenderId: '341078202353',
  firestoreDatabaseId:
    (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
    'ai-studio-mitolegjendahist-5740fc67-890c-4bdb-a200-32c2bacda369',
};

const existingFirestoreApp = getApps().find((a) => a.name === 'mito-firestore');
const firebaseApp = existingFirestoreApp || initializeApp(FIRESTORE_PROJECT_CONFIG, 'mito-firestore');
export const firestoreDb = getFirestore(firebaseApp, FIRESTORE_PROJECT_CONFIG.firestoreDatabaseId);
const CLOUD_DOC_REF = doc(firestoreDb, 'mitoSystemState', 'main');

export interface ActiveSessionRecord {
  sessionId: string;
  userId: string;
  deviceId?: string;
  deviceLabel?: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revoked: boolean;
  activityLog?: DeviceActivityItem[];
}

export interface SiteSettingsRecord {
  platformName: string;
  primaryTagline: string;
  secondaryTagline: string;
  defaultLanguage: 'sq' | 'en';
  schoolRankingsEnabled: boolean;
  watermarkEnabled: boolean;
  maintenanceMode: boolean;
  maxUploadSizeMb: number;
  googleDriveFolderUrl?: string;
  googleDriveFolderId?: string;
  googleDriveAccessToken?: string;
  lastDriveSyncAt?: string;
  updatedAt: string;
}

export interface MitoDatabaseSchema {
  users: UserAccount[];
  content: VideoContent[];
  categories: CategoryItem[];
  episodes: EpisodeItem[];
  mediaAssets: MediaAsset[];
  games: GameItem[];
  gameQuestions: GameQuestionFull[];
  playbackProgress: PlaybackProgressRecord[];
  multiplayerRooms: MultiplayerRoom[];
  leaderboardEntries: LeaderboardEntry[];
  achievements: AchievementDefinition[];
  activeSessions: ActiveSessionRecord[];
  bannedDevices: BannedDeviceRecord[];
  supportTickets: SupportTicket[];
  auditLogs: AuditLogEntry[];
  deletedIds?: string[];
  siteSettings: SiteSettingsRecord;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'mito-db.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function createEmptyDatabase(): MitoDatabaseSchema {
  return {
    users: [],
    content: [],
    categories: [],
    episodes: [],
    mediaAssets: [],
    games: [],
    gameQuestions: [],
    playbackProgress: [],
    multiplayerRooms: [],
    leaderboardEntries: [],
    achievements: [...DEFAULT_ACHIEVEMENTS],
    activeSessions: [],
    bannedDevices: [],
    supportTickets: [],
    auditLogs: [],
    deletedIds: [],
    siteSettings: {
      platformName: 'MITO',
      primaryTagline: 'LEGJENDA · HISTORI · LOJËRA',
      secondaryTagline: 'Shiko. Mëso. Luaj. Konkuro.',
      defaultLanguage: 'sq',
      schoolRankingsEnabled: true,
      watermarkEnabled: true,
      maintenanceMode: false,
      maxUploadSizeMb: 2048,
      googleDriveFolderUrl: DEFAULT_GOOGLE_DRIVE_DRIVE_URL_CONST(),
      googleDriveFolderId: DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
      updatedAt: new Date().toISOString(),
    },
  };
}

function DEFAULT_GOOGLE_DRIVE_DRIVE_URL_CONST(): string {
  return DEFAULT_GOOGLE_DRIVE_FOLDER_URL;
}

function ensureAllUsersHaveFullCode(users: UserAccount[]): boolean {
  let mutated = false;
  for (const u of users) {
    if (u.role === 'super_admin') {
      if (u.fullCode !== '111-222-333') {
        u.fullCode = '111-222-333';
        mutated = true;
      }
      continue;
    }
    if (u.uid === 'usr_demo_shkoder' && !u.fullCode) {
      u.fullCode = '222-333-444';
      mutated = true;
      continue;
    }
    if (!u.fullCode || u.fullCode.includes('*')) {
      const tail3 = (u.maskedCode || '').replace(/\D/g, '').slice(-3).padStart(3, '0');
      const mid3 = crypto.randomInt(100, 999).toString();
      const first3 = crypto.randomInt(100, 999).toString();
      const digits9 = `${first3}${mid3}${tail3}`;
      const formatted = `${first3}-${mid3}-${tail3}`;
      const salt = u.codeSalt || crypto.randomBytes(16).toString('hex');
      u.codeSalt = salt;
      u.codeHash = hashAccessCode(digits9, salt, PEPPER);
      u.maskedCode = maskAccessCode(digits9);
      u.fullCode = formatted;
      mutated = true;
    }
  }
  return mutated;
}

function mergeByKey<T>(
  cloudArr: T[] | undefined,
  localArr: T[] | undefined,
  keyFn: (item: T) => string,
  deletedSet: Set<string>,
  preferCloud = true
): T[] {
  const map = new Map<string, T>();
  const first = preferCloud ? localArr || [] : cloudArr || [];
  const second = preferCloud ? cloudArr || [] : localArr || [];
  for (const item of first) {
    const k = keyFn(item);
    if (k && !deletedSet.has(k)) map.set(k, item);
  }
  for (const item of second) {
    const k = keyFn(item);
    if (k && !deletedSet.has(k)) map.set(k, item);
  }
  return Array.from(map.values());
}

class MitoStore {
  private data: MitoDatabaseSchema;
  private lastCloudSyncMs = 0;
  private lastLocalMutationMs = 0;
  private initialSyncDone = false;
  private initialSyncPromise: Promise<void>;
  private inFlightRestorePromises = new Map<string, Promise<boolean>>();

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    this.data = this.loadFromDisk();
    ensureAllUsersHaveFullCode(this.data.users);
    // Perform immediate cloud sync on startup before any saveToCloud can overwrite Firestore
    this.initialSyncPromise = this.syncFromCloud(true)
      .catch(() => {})
      .finally(() => {
        this.initialSyncDone = true;
      });
  }

  private loadFromDisk(): MitoDatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const stat = fs.statSync(DB_FILE);
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<MitoDatabaseSchema>;
        const base = createEmptyDatabase();
        const hasRealData =
          (parsed.content && parsed.content.length > 0) ||
          (parsed.games && parsed.games.length > 0) ||
          (parsed.users && parsed.users.some((u) => u.role !== 'super_admin'));
        this.lastLocalMutationMs = hasRealData ? stat.mtimeMs : 0;
        return {
          ...base,
          ...parsed,
          bannedDevices: Array.isArray(parsed.bannedDevices) ? parsed.bannedDevices : [],
          supportTickets: Array.isArray(parsed.supportTickets) ? parsed.supportTickets : [],
          deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
          siteSettings: {
            ...base.siteSettings,
            ...(parsed.siteSettings || {}),
          },
          achievements:
            parsed.achievements && parsed.achievements.length > 0
              ? parsed.achievements
              : base.achievements,
        };
      }
    } catch (err) {
      console.error('Error loading MITO database from disk:', err);
    }
    // Cold start: do NOT set lastLocalMutationMs so Firestore cloud state always wins on startup
    this.lastLocalMutationMs = 0;
    return createEmptyDatabase();
  }

  private saveToDisk(state: MitoDatabaseSchema = this.data, updateMutationTime = true): void {
    try {
      if (updateMutationTime) {
        this.lastLocalMutationMs = Date.now();
      }
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Error saving MITO database to disk:', err);
    }
  }

  public markDeleted(id: string | string[]): void {
    if (!this.data.deletedIds) {
      this.data.deletedIds = [];
    }
    const list = Array.isArray(id) ? id : [id];
    const set = new Set(this.data.deletedIds);
    for (const item of list) {
      if (item) set.add(item);
    }
    this.data.deletedIds = Array.from(set).slice(-500);
  }

  public unmarkDeleted(id: string | string[]): void {
    if (!this.data.deletedIds) return;
    const removeSet = new Set(Array.isArray(id) ? id : [id]);
    this.data.deletedIds = this.data.deletedIds.filter((x) => !removeSet.has(x));
  }

  public async saveToCloud(): Promise<void> {
    if (!this.initialSyncDone) {
      await this.initialSyncPromise;
    }
    try {
      const nowIso = new Date().toISOString();

      // Offload large base64 thumbnails (> 15KB) to separate mitoSystemState/img_<contentId> docs
      // so mitoSystemState/main never hits the 950KB document limit
      const compactContent: VideoContent[] = [];
      for (const c of this.data.content) {
        const copy = { ...c };
        const rawThumb = copy.thumbnailUrl || copy.posterUrl || copy.heroUrl || '';
        if (rawThumb.startsWith('data:image/') && rawThumb.length > 15000) {
          const imgDocId = `img_${copy.contentId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
          try {
            await setDoc(doc(firestoreDb, 'mitoSystemState', imgDocId), {
              payloadJson: JSON.stringify({ dataUrl: rawThumb }),
              updatedAt: nowIso,
            });
            // Keep thumbnailUrl in main payload only if total size fits, otherwise reference imgDocId
            if (copy.posterUrl === rawThumb) copy.posterUrl = `/api/media/thumb/${copy.contentId}`;
            if (copy.heroUrl === rawThumb) copy.heroUrl = `/api/media/thumb/${copy.contentId}`;
          } catch {
            // Keep inline if doc write fails
          }
        }
        compactContent.push(copy);
      }

      const activeSessionsToSave = (this.data.activeSessions || []).slice(-120);

      const cloudPayload: Partial<MitoDatabaseSchema> = {
        users: this.data.users,
        content: compactContent,
        categories: this.data.categories,
        episodes: this.data.episodes,
        mediaAssets: this.data.mediaAssets.map((a) => ({
          ...a,
          autoThumbnailUrl:
            a.autoThumbnailUrl && a.autoThumbnailUrl.length > 25000
              ? undefined
              : a.autoThumbnailUrl,
        })),
        games: this.data.games,
        gameQuestions: this.data.gameQuestions,
        playbackProgress: this.data.playbackProgress,
        leaderboardEntries: this.data.leaderboardEntries,
        activeSessions: activeSessionsToSave,
        bannedDevices: this.data.bannedDevices || [],
        supportTickets: (this.data.supportTickets || []).slice(-100),
        deletedIds: this.data.deletedIds || [],
        siteSettings: this.data.siteSettings,
      };

      let payloadJson = JSON.stringify(cloudPayload);
      // If still > 920KB, replace inline thumbnailUrl on compactContent with /api/media/thumb/:contentId
      if (payloadJson.length > 920000) {
        for (const item of compactContent) {
          if (item.thumbnailUrl?.startsWith('data:image/')) {
            item.thumbnailUrl = `/api/media/thumb/${item.contentId}`;
          }
        }
        payloadJson = JSON.stringify(cloudPayload);
      }

      if (payloadJson.length <= 948000) {
        await setDoc(CLOUD_DOC_REF, {
          payloadJson,
          updatedAt: nowIso,
        });
        this.lastCloudSyncMs = Date.now();
      }
    } catch {
      // Ignore transient network errors; local disk is always saved
    }
  }

  public async syncFromCloud(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastCloudSyncMs < 1200) {
      return;
    }
    this.lastCloudSyncMs = now;
    try {
      const snap = await getDoc(CLOUD_DOC_REF);
      if (!snap.exists()) {
        if (this.data.users.length > 0 || this.data.content.length > 0) {
          this.initialSyncDone = true;
          await this.saveToCloud();
        }
        return;
      }
      const docData = snap.data();
      if (!docData || typeof docData.payloadJson !== 'string') return;
      const cloudUpdatedMs = docData.updatedAt ? new Date(docData.updatedAt).getTime() : 0;
      const cloudState = JSON.parse(docData.payloadJson) as Partial<MitoDatabaseSchema>;

      const preferCloud = cloudUpdatedMs >= this.lastLocalMutationMs - 1000;
      const mergedDeletedIds = Array.from(
        new Set([...(this.data.deletedIds || []), ...(cloudState.deletedIds || [])])
      );
      this.data.deletedIds = mergedDeletedIds;
      const deletedSet = new Set(mergedDeletedIds);

      // Always union/merge collections so no user, video, mediaAsset, category, or quiz is ever lost!
      this.data.users = mergeByKey(
        cloudState.users,
        this.data.users,
        (u) => u.uid,
        deletedSet,
        preferCloud
      );
      ensureAllUsersHaveFullCode(this.data.users);

      this.data.content = mergeByKey(
        cloudState.content,
        this.data.content,
        (c) => c.contentId,
        deletedSet,
        preferCloud
      );

      this.data.mediaAssets = mergeByKey(
        cloudState.mediaAssets,
        this.data.mediaAssets,
        (a) => a.assetId,
        deletedSet,
        preferCloud
      );

      this.data.categories = mergeByKey(
        cloudState.categories,
        this.data.categories,
        (c) => c.categoryId,
        deletedSet,
        preferCloud
      );

      this.data.episodes = mergeByKey(
        cloudState.episodes,
        this.data.episodes,
        (e) => e.episodeId,
        deletedSet,
        preferCloud
      );

      this.data.games = mergeByKey(
        cloudState.games,
        this.data.games,
        (g) => g.gameId,
        deletedSet,
        preferCloud
      );

      this.data.gameQuestions = mergeByKey(
        cloudState.gameQuestions,
        this.data.gameQuestions,
        (q) => q.questionId,
        deletedSet,
        preferCloud
      );

      this.data.playbackProgress = mergeByKey(
        cloudState.playbackProgress,
        this.data.playbackProgress,
        (p) => p.progressId,
        deletedSet,
        preferCloud
      );

      this.data.leaderboardEntries = mergeByKey(
        cloudState.leaderboardEntries,
        this.data.leaderboardEntries,
        (l) => l.entryId,
        deletedSet,
        preferCloud
      );

      this.data.activeSessions = mergeByKey(
        cloudState.activeSessions,
        this.data.activeSessions,
        (s) => s.sessionId,
        deletedSet,
        preferCloud
      );

      this.data.bannedDevices = mergeByKey(
        cloudState.bannedDevices,
        this.data.bannedDevices,
        (b) => `${b.deviceId}_${b.userId || 'global'}`,
        deletedSet,
        preferCloud
      );

      const rawMergedTickets = mergeByKey(
        cloudState.supportTickets,
        this.data.supportTickets,
        (t) => t.ticketId,
        deletedSet,
        preferCloud
      );
      const localTicketMap = new Map((this.data.supportTickets || []).map((t) => [t.ticketId, t]));
      const cloudTicketMap = new Map((cloudState.supportTickets || []).map((t) => [t.ticketId, t]));
      this.data.supportTickets = rawMergedTickets.map((t) => {
        const loc = localTicketMap.get(t.ticketId);
        const cld = cloudTicketMap.get(t.ticketId);
        if (!loc || !cld) return t;
        const locTime = new Date(loc.updatedAt || loc.createdAt || 0).getTime();
        const cldTime = new Date(cld.updatedAt || cld.createdAt || 0).getTime();
        const newest = locTime >= cldTime ? loc : cld;
        const msgMap = new Map<string, SupportTicket['messages'][number]>();
        for (const m of [...(cld.messages || []), ...(loc.messages || [])]) {
          if (m && m.messageId) msgMap.set(m.messageId, m);
        }
        const mergedMessages = Array.from(msgMap.values()).sort(
          (a, b) =>
            new Date(a.createdAt || a.timestamp || 0).getTime() -
            new Date(b.createdAt || b.timestamp || 0).getTime()
        );
        return {
          ...newest,
          messages: mergedMessages,
        };
      });

      if (preferCloud && cloudState.siteSettings) {
        this.data.siteSettings = {
          ...this.data.siteSettings,
          ...cloudState.siteSettings,
        };
      }

      this.saveToDisk(this.data, false);
    } catch {
      // Ignore transient Firestore error
    }
  }

  /**
   * Saves a video binary file into Firestore chunk documents (`mitoSystemState/${assetId}_c_${i}`)
   * so that the video file persists across container restarts, app updates, and Cloud Run instances.
   */
  public async saveMediaFileToCloud(assetId: string, diskPath: string): Promise<number> {
    try {
      if (!fs.existsSync(diskPath)) return 0;
      const fileBuf = fs.readFileSync(diskPath);
      if (fileBuf.length === 0) return 0;

      const chunkSize = 600 * 1024; // 600KB binary -> ~800KB base64 (under 950KB Firestore rule limit)
      const totalChunks = Math.ceil(fileBuf.length / chunkSize);
      const nowIso = new Date().toISOString();
      const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]/g, '_');

      // Upload chunks in parallel batches of 6
      const batchSize = 6;
      for (let i = 0; i < totalChunks; i += batchSize) {
        const promises: Promise<void>[] = [];
        for (let j = i; j < Math.min(totalChunks, i + batchSize); j++) {
          const slice = fileBuf.subarray(j * chunkSize, Math.min(fileBuf.length, (j + 1) * chunkSize));
          const chunkDocId = `${safeAssetId}_c_${j}`;
          promises.push(
            setDoc(doc(firestoreDb, 'mitoSystemState', chunkDocId), {
              payloadJson: slice.toString('base64'),
              updatedAt: nowIso,
            })
          );
        }
        await Promise.all(promises);
      }

      // Also store a manifest doc so any instance knows the exact chunk count even before main syncs
      await setDoc(doc(firestoreDb, 'mitoSystemState', `${safeAssetId}_meta`), {
        payloadJson: JSON.stringify({
          assetId,
          totalChunks,
          fileSizeBytes: fileBuf.length,
        }),
        updatedAt: nowIso,
      });

      const asset = this.data.mediaAssets.find((a) => a.assetId === assetId);
      if (asset) {
        asset.cloudChunkCount = totalChunks;
        this.saveToDisk(this.data, true);
        await this.saveToCloud();
      }
      return totalChunks;
    } catch (err) {
      console.error('Error saving media file chunks to Firestore:', err);
      return 0;
    }
  }

  /**
   * Restores a video binary file from Firestore chunk documents (`mitoSystemState/${assetId}_c_${i}`)
   * onto local disk `.data/uploads/...` if the container restarted or was updated.
   */
  public async restoreMediaFileFromCloud(
    assetId: string,
    targetDiskPath: string,
    knownChunkCount?: number
  ): Promise<boolean> {
    if (fs.existsSync(targetDiskPath) && fs.statSync(targetDiskPath).size > 1024) {
      return true;
    }

    const existingPromise = this.inFlightRestorePromises.get(assetId);
    if (existingPromise) {
      return existingPromise;
    }

    const restoreTask = (async () => {
      try {
        const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
        let totalChunks = knownChunkCount || 0;

        if (!totalChunks) {
          const metaSnap = await getDoc(doc(firestoreDb, 'mitoSystemState', `${safeAssetId}_meta`));
          if (metaSnap.exists()) {
            const metaData = JSON.parse(metaSnap.data()?.payloadJson || '{}');
            totalChunks = Number(metaData.totalChunks || 0);
          }
        }

        if (!totalChunks) {
          // Probe chunk 0 directly
          const c0 = await getDoc(doc(firestoreDb, 'mitoSystemState', `${safeAssetId}_c_0`));
          if (!c0.exists()) return false;
          totalChunks = 1;
        }

        const buffers: Buffer[] = new Array(totalChunks);
        const batchSize = 8;
        for (let i = 0; i < totalChunks; i += batchSize) {
          const batchIndices: number[] = [];
          for (let j = i; j < Math.min(totalChunks, i + batchSize); j++) {
            batchIndices.push(j);
          }
          const snaps = await Promise.all(
            batchIndices.map((idx) =>
              getDoc(doc(firestoreDb, 'mitoSystemState', `${safeAssetId}_c_${idx}`))
            )
          );
          for (let k = 0; k < snaps.length; k++) {
            const snap = snaps[k];
            if (!snap.exists()) return false;
            const b64 = snap.data()?.payloadJson;
            if (typeof b64 !== 'string') return false;
            buffers[batchIndices[k]] = Buffer.from(b64, 'base64');
          }
        }

        const fullBuf = Buffer.concat(buffers);
        if (fullBuf.length === 0) return false;

        const tmpPath = `${targetDiskPath}.restore_${Date.now()}.tmp`;
        fs.writeFileSync(tmpPath, fullBuf);
        fs.renameSync(tmpPath, targetDiskPath);
        return true;
      } catch (err) {
        console.error('Error restoring media file from Firestore:', err);
        return false;
      } finally {
        this.inFlightRestorePromises.delete(assetId);
      }
    })();

    this.inFlightRestorePromises.set(assetId, restoreTask);
    return restoreTask;
  }

  public getState(): MitoDatabaseSchema {
    ensureAllUsersHaveFullCode(this.data.users);
    return this.data;
  }

  public commit(): void {
    ensureAllUsersHaveFullCode(this.data.users);
    this.saveToDisk(this.data, true);
    this.saveToCloud().catch(() => {});
  }

  public async commitAsync(): Promise<void> {
    ensureAllUsersHaveFullCode(this.data.users);
    this.saveToDisk(this.data, true);
    await this.saveToCloud();
  }

  public async getCloudThumbnail(contentId: string): Promise<string | null> {
    try {
      const imgDocId = `img_${contentId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      const snap = await getDoc(doc(firestoreDb, 'mitoSystemState', imgDocId));
      if (!snap.exists()) return null;
      const parsed = JSON.parse(String(snap.data()?.payloadJson || '{}'));
      return typeof parsed.dataUrl === 'string' ? parsed.dataUrl : null;
    } catch {
      return null;
    }
  }

  public addAuditLog(entry: Omit<AuditLogEntry, 'logId' | 'timestamp'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      logId: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.data.auditLogs.unshift(fullEntry);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.commit();
    return fullEntry;
  }
}

export const store = new MitoStore();
