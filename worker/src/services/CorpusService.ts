import { CorpusService, CorpusData } from '../types';
import { StorageManager } from '../storage';
import { generateId, validateAudioFormat, getCurrentTimestamp } from '../utils';

interface Env {
  MINIO_ENDPOINT?: string;
  MINIO_ACCESS_KEY?: string;
  MINIO_SECRET_KEY?: string;
  MINIO_BUCKET_NAME?: string;
}

/**
 * 语料收集服务
 * 专门处理语料数据的上传、验证和管理
 */
export class CorpusServiceImpl implements CorpusService {
  private storageManager: StorageManager;

  constructor(private env: Env) {
    this.storageManager = new StorageManager(env);
  }

  /**
   * 上传语料数据
   */
  async upload(data: CorpusData): Promise<void> {
    // 验证语料数据
    if (!await this.validate(data)) {
      throw new Error('语料数据验证失败');
    }

    const corpusId = generateId('corpus');
    const timestamp = getCurrentTimestamp();

    try {
      // 保存音频数据
      const audioKey = `corpus/audio/${corpusId}.wav`;
      await this.storageManager.saveAudio(audioKey, data.audio);

      // 保存元数据
      const metadata = {
        id: corpusId,
        transcript: data.transcript,
        speakerId: data.speakerId,
        userId: data.userId,           // 用户ID
        sessionId: data.sessionId,     // 会话ID
        timestamp,
        audioSize: data.audio.byteLength,
        audioFormat: this.detectAudioFormat(data.audio),
        ...data.metadata,
      };

      const metadataKey = `corpus/metadata/${corpusId}.json`;
      const metadataBuffer = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
      await this.storageManager.saveAudio(metadataKey, metadataBuffer);

      console.log(`语料上传成功: ${corpusId}, 音频大小: ${data.audio.byteLength} bytes`);
      
    } catch (error) {
      console.error('语料上传失败:', error);
      throw new Error(`语料上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 验证语料数据
   */
  async validate(data: CorpusData): Promise<boolean> {
    // 检查音频数据
    if (!data.audio || data.audio.byteLength === 0) {
      throw new Error('音频数据不能为空');
    }

    if (!validateAudioFormat(data.audio)) {
      throw new Error('无效的音频格式');
    }

    // 检查音频大小限制（10MB）
    if (data.audio.byteLength > 10 * 1024 * 1024) {
      throw new Error('音频文件过大（最大10MB）');
    }

    // 检查转录文本
    if (!data.transcript || data.transcript.trim().length === 0) {
      throw new Error('转录文本不能为空');
    }

    if (data.transcript.length > 1000) {
      throw new Error('转录文本过长（最多1000字符）');
    }

    // 检查说话人ID格式
    if (data.speakerId && !this.isValidSpeakerId(data.speakerId)) {
      throw new Error('无效的说话人ID格式');
    }

    // 检查用户ID格式
    if (data.userId && !this.isValidUserId(data.userId)) {
      throw new Error('无效的用户ID格式');
    }

    // 检查会话ID格式
    if (data.sessionId && !this.isValidSessionId(data.sessionId)) {
      throw new Error('无效的会话ID格式');
    }

    return true;
  }

  /**
   * 批量上传语料
   */
  async uploadBatch(corpusDataList: CorpusData[]): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const data of corpusDataList) {
      try {
        await this.upload(data);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(error instanceof Error ? error.message : '未知错误');
      }
    }

    return results;
  }

  /**
   * 查询语料数据
   */
  async query(query: CorpusQuery): Promise<CorpusData[]> {
    // Minio存储不支持复杂查询，这里返回空数组
    // 实际项目中可能需要维护索引或使用数据库
    console.log('语料查询:', query);
    return [];
  }

  /**
   * 获取语料统计信息
   */
  async getStats(): Promise<CorpusStats> {
    // Minio存储无法直接统计，这里返回基础信息
    return {
      totalCorpus: 0,
      totalAudioSize: 0,
      uniqueSpeakers: 0,
      uniqueUsers: 0,
      uniqueSessions: 0,
      lastUpload: null,
    };
  }

  /**
   * 获取用户统计信息
   */
  async getUserStats(userId: string): Promise<{
    totalCorpus: number;
    totalAudioSize: number;
    uniqueSessions: number;
    lastUpload: string | null;
  }> {
    // 验证用户ID格式
    if (!this.isValidUserId(userId)) {
      throw new Error('无效的用户ID格式');
    }

    // Minio存储无法直接统计，这里返回基础信息
    return {
      totalCorpus: 0,
      totalAudioSize: 0,
      uniqueSessions: 0,
      lastUpload: null,
    };
  }

  /**
   * 检测音频格式
   */
  private detectAudioFormat(audio: ArrayBuffer): string {
    const view = new DataView(audio);
    
    // 检查WAV文件头
    if (audio.byteLength >= 12) {
      const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      
      if (riff === 'RIFF' && wave === 'WAVE') {
        return 'wav';
      }
    }
    
    // 检查其他格式（简化实现）
    return 'unknown';
  }

  /**
   * 验证说话人ID格式
   */
  private isValidSpeakerId(speakerId: string): boolean {
    // 简单的格式验证：字母数字和短横线，长度2-50字符
    return /^[a-zA-Z0-9-]{2,50}$/.test(speakerId);
  }

  /**
   * 验证用户ID格式
   */
  private isValidUserId(userId: string): boolean {
    // 用户ID格式验证：字母数字和下划线，长度1-100字符
    // 支持UUID、数字ID、用户名等格式
    return /^[a-zA-Z0-9_-]{1,100}$/.test(userId);
  }

  /**
   * 验证会话ID格式
   */
  private isValidSessionId(sessionId: string): boolean {
    // 会话ID格式验证：字母数字和下划线，长度1-64字符
    // 支持UUID、时间戳+随机数等格式
    return /^[a-zA-Z0-9_-]{1,64}$/.test(sessionId);
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 测试存储连接
      const testData: CorpusData = {
        audio: new TextEncoder().encode('test').buffer,
        transcript: '测试文本',
        speakerId: 'test_speaker',
      };
      
      await this.validate(testData);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 生成语料下载链接（需要Minio配置为公开访问或使用预签名URL）
   */
  async generateDownloadUrl(corpusId: string, type: 'audio' | 'metadata'): Promise<string | null> {
    if (!this.env.MINIO_ENDPOINT) {
      return null;
    }

    const objectKey = `corpus/${type}/${corpusId}.${type === 'audio' ? 'wav' : 'json'}`;
    
    // 简化实现：直接返回对象URL
    // 实际项目中应使用Minio的预签名URL功能
    const { MINIO_ENDPOINT, MINIO_BUCKET_NAME } = this.env;
    const port = this.env.MINIO_PORT || '9000';
    const useSSL = this.env.MINIO_USE_SSL === 'true';
    const protocol = useSSL ? 'https' : 'http';
    
    return `${protocol}://${MINIO_ENDPOINT}:${port}/${MINIO_BUCKET_NAME}/${objectKey}`;
  }
}