// Cloudflare D1 数据库管理模块
class DatabaseManager {
    constructor(env) {
        this.env = env;
        this.db = null;
    }

    // 初始化数据库连接
    init(env) {
        if (env.DB) {
            this.db = env.DB;
        } else {
            console.warn('D1 database binding not found');
        }
    }

    // 创建所需数据表
    async createTables() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // 创建播放列表表
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        // 创建音乐表
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER,
                song_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT,
                album TEXT,
                source TEXT NOT NULL,
                url TEXT,
                cover_url TEXT,
                duration INTEGER,
                order_index INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE
            )
        `).run();

        // 创建收藏表
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT,
                album TEXT,
                source TEXT NOT NULL,
                cover_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(song_id, source)
            )
        `).run();

        // 创建设置表
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();
    }

    // 获取所有播放列表
    async getPlaylists() {
        if (!this.db) return [];
        
        const result = await this.db.prepare(`
            SELECT * FROM playlists ORDER BY created_at DESC
        `).all();
        
        return result.results || [];
    }

    // 创建新播放列表
    async createPlaylist(name) {
        if (!this.db) return null;
        
        const result = await this.db.prepare(`
            INSERT INTO playlists (name) VALUES (?) RETURNING *
        `).bind(name).run();
        
        return result.success ? result.results[0] : null;
    }

    // 删除播放列表
    async deletePlaylist(id) {
        if (!this.db) return false;
        
        const result = await this.db.prepare(`
            DELETE FROM playlists WHERE id = ?
        `).bind(id).run();
        
        return result.success;
    }

    // 获取播放列表中的歌曲
    async getPlaylistSongs(playlistId) {
        if (!this.db) return [];
        
        const result = await this.db.prepare(`
            SELECT * FROM songs WHERE playlist_id = ? ORDER BY order_index ASC
        `).bind(playlistId).all();
        
        return result.results || [];
    }

    // 向播放列表添加歌曲
    async addSongToPlaylist(playlistId, song) {
        if (!this.db) return null;
        
        // 获取当前播放列表中的歌曲数量，用于确定新歌曲的位置
        const countResult = await this.db.prepare(`
            SELECT COUNT(*) as count FROM songs WHERE playlist_id = ?
        `).bind(playlistId).all();
        
        const orderIndex = countResult.results[0]?.count || 0;
        
        const result = await this.db.prepare(`
            INSERT INTO songs 
            (playlist_id, song_id, title, artist, album, source, url, cover_url, duration, order_index) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
        `).bind(
            playlistId,
            song.id,
            song.name,
            song.artist,
            song.album || '',
            song.source,
            song.url || '',
            song.pic || '',
            song.duration || 0,
            orderIndex
        ).run();
        
        return result.success ? result.results[0] : null;
    }

    // 从播放列表移除歌曲
    async removeSongFromPlaylist(playlistId, songId) {
        if (!this.db) return false;
        
        const result = await this.db.prepare(`
            DELETE FROM songs WHERE playlist_id = ? AND song_id = ?
        `).bind(playlistId, songId).run();
        
        return result.success;
    }

    // 获取收藏列表
    async getFavorites() {
        if (!this.db) return [];
        
        const result = await this.db.prepare(`
            SELECT * FROM favorites ORDER BY created_at DESC
        `).all();
        
        return result.results || [];
    }

    // 添加到收藏
    async addFavorite(song) {
        if (!this.db) return null;
        
        const result = await this.db.prepare(`
            INSERT OR IGNORE INTO favorites 
            (song_id, title, artist, album, source, cover_url) 
            VALUES (?, ?, ?, ?, ?, ?) RETURNING *
        `).bind(
            song.id,
            song.name,
            song.artist,
            song.album || '',
            song.source,
            song.pic || ''
        ).run();
        
        return result.success ? result.results[0] : null;
    }

    // 从收藏移除
    async removeFavorite(songId, source) {
        if (!this.db) return false;
        
        const result = await this.db.prepare(`
            DELETE FROM favorites WHERE song_id = ? AND source = ?
        `).bind(songId, source).run();
        
        return result.success;
    }

    // 获取设置
    async getSetting(key) {
        if (!this.db) return null;
        
        const result = await this.db.prepare(`
            SELECT value FROM settings WHERE key = ?
        `).bind(key).all();
        
        return result.results?.length ? result.results[0].value : null;
    }

    // 保存设置
    async saveSetting(key, value) {
        if (!this.db) return false;
        
        // 先尝试更新
        const updateResult = await this.db.prepare(`
            UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?
        `).bind(value, key).run();
        
        // 如果没有更新任何行，则插入新记录
        if (updateResult.changes === 0) {
            const insertResult = await this.db.prepare(`
                INSERT INTO settings (key, value) VALUES (?, ?)
            `).bind(key, value).run();
            
            return insertResult.success;
        }
        
        return updateResult.success;
    }
}

export default new DatabaseManager();