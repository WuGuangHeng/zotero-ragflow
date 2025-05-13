﻿import {
  RAGFlowAPIResponse,
  ChatAssistantParams,
  ChatAssistantResponse,
  CompletionResponse,
  DatasetResponse,
  DocumentListResponse,
  SessionResponse,
  KnowledgeBaseStatusType,
  KnowledgeBaseStatus,
  ApiErrorCode,
} from "./types/common";

export class RAGFlowService {
  private baseURL = "http://127.0.0.1:8000"; // 更改为实际 RAGFlow API 地址
  private apiKey = "ragflow-ZkZjFlZmIwZjVhNjExZWZhNDNmMDI0Mm"; // RAGFlow API 密钥

  constructor() {}

  /**
   * 设置 API 密钥
   */
  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * 设置基础 URL
   */
  public setBaseURL(baseURL: string): void {
    this.baseURL = baseURL;
  }

  /**
   * 创建知识库数据集
   */
  public async createDataset(name: string): Promise<string> {
    try {
      const requestBody = {
        name: name,
        language: "Chinese",
        embedding_model: "BAAI/bge-large-zh-v1.5",
        permission: "me",
        chunk_method: "naive",
        parser_config: {
          chunk_token_num: 256, // 更新参数名称与API一致
          layout_recognize: true,
          html4excel: false,
          delimiter: "\n!?。；！？",
          task_page_size: 12,
          raptor: { use_raptor: false },
        },
      };

      const response = await fetch(`${this.baseURL}/api/v1/datasets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `创建数据集HTTP错误: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result =
        (await response.json()) as RAGFlowAPIResponse<DatasetResponse>;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `创建知识库失败 (错误码: ${result.code})`,
        );
      }

      return result.data.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`创建知识库'${name}'失败: ${errorMessage}`);
    }
  }

  /**
   * 检查数据集是否存在
   * @param datasetId 数据集ID
   * @returns 是否存在
   */
  public async datasetExists(datasetId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/v1/datasets?id=${datasetId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      const result = (await response.json()) as RAGFlowAPIResponse<
        DatasetResponse[]
      >;

      if (result.code !== ApiErrorCode.Success) {
        return false;
      }

      return (
        result.data && Array.isArray(result.data) && result.data.length > 0
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * 上传单个文件到现有数据集并返回文档ID
   * @param datasetId 数据集ID
   * @param file 文件信息
   * @returns 上传后的文档ID
   */
  public async uploadSingleFile(
    datasetId: string,
    file: { path: string; name: string; mimeType: string },
  ): Promise<string> {
    try {
      // 检查文件类型
      const isHTML =
        file.mimeType === "text/html" ||
        file.path.toLowerCase().endsWith(".html") ||
        file.path.toLowerCase().endsWith(".htm");
      const isSnapshot =
        file.name.includes("Snapshot") || file.path.includes("Snapshot");

      if (isHTML || isSnapshot) {
        throw new Error("不支持的文件类型: HTML或快照文件");
      }

      // 检查数据集是否存在
      const exists = await this.datasetExists(datasetId);
      if (!exists) {
        throw new Error(`数据集 ${datasetId} 不存在`);
      }

      // 读取文件内容
      const fileContent = await Zotero.File.getBinaryContentsAsync(file.path);

      // 设置multipart boundary
      const boundary =
        "----WebKitFormBoundary" + Math.random().toString(16).slice(2);

      // 上传文件并获取文档ID
      const documentId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `${this.baseURL}/api/v1/datasets/${datasetId}/documents`,
        );
        xhr.setRequestHeader("Authorization", `Bearer ${this.apiKey}`);
        xhr.setRequestHeader(
          "Content-Type",
          `multipart/form-data; boundary=${boundary}`,
        );

        // 构建请求主体
        let requestBody = `--${boundary}\r\n`;
        requestBody += `Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`;
        requestBody += `Content-Type: ${file.mimeType}\r\n\r\n`;

        // 转换为二进制数据
        const encoder = new TextEncoder();
        const headerBytes = encoder.encode(requestBody);
        const footerBytes = encoder.encode(`\r\n--${boundary}--\r\n`);

        const contentBytes = new Uint8Array(fileContent.length);
        for (let i = 0; i < fileContent.length; i++) {
          contentBytes[i] = fileContent.charCodeAt(i) & 0xff;
        }

        const body = new Uint8Array(
          headerBytes.length + contentBytes.length + footerBytes.length,
        );
        body.set(headerBytes, 0);
        body.set(contentBytes, headerBytes.length);
        body.set(footerBytes, headerBytes.length + contentBytes.length);

        xhr.onload = function () {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.code === ApiErrorCode.Success) {
                // 解析返回的文档ID
                if (
                  response.data &&
                  Array.isArray(response.data) &&
                  response.data.length > 0
                ) {
                  const docId = response.data[0].id;
                  if (docId) {
                    resolve(docId);
                    return;
                  }
                }
                reject(new Error("无法从响应中提取文档ID"));
              } else {
                if (
                  response.message &&
                  response.message.includes(
                    "This type of file has not been supported yet",
                  )
                ) {
                  reject(new Error(`文件类型不支持: ${file.name}`));
                } else {
                  reject(
                    new Error(response.message || `上传文件失败: API错误`),
                  );
                }
              }
            } catch (e) {
              reject(
                new Error(
                  `解析响应失败: ${e instanceof Error ? e.message : String(e)}`,
                ),
              );
            }
          } else {
            reject(
              new Error(`上传文件HTTP错误: ${xhr.status} ${xhr.statusText}`),
            );
          }
        };

        xhr.onerror = () => reject(new Error("网络错误"));
        xhr.send(body);
      });

      // 解析文档
      await this.parseDocuments(datasetId, [documentId]);

      return documentId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`上传文件 ${file.name} 时出错: ${errorMessage}`);
    }
  }

  /**
   * 上传文件到 RAGFlow 知识库
   * 注意：此方法会创建新的数据集，应当仅在初始化时使用
   */
  public async uploadFiles(
    files: Array<{ path: string; name: string; mimeType: string }>,
    collectionName: string,
  ): Promise<{ datasetId: string; documentIds: string[] }> {
    try {
      const supportedFiles = files.filter((file) => {
        const isHTML =
          file.mimeType === "text/html" ||
          file.path.toLowerCase().endsWith(".html") ||
          file.path.toLowerCase().endsWith(".htm");
        const isSnapshot =
          file.name.includes("Snapshot") || file.path.includes("Snapshot");

        if (isHTML || isSnapshot) return false;
        return true;
      });

      if (supportedFiles.length === 0) {
        throw new Error(
          "没有找到RAGFlow支持的文件类型。目前不支持HTML快照文件。",
        );
      }

      // 创建数据集
      const datasetId = await this.createDataset(collectionName);
      const uploadedDocumentIds: string[] = [];

      // 逐个上传文件
      for (const file of supportedFiles) {
        try {
          // 读取文件内容
          const fileContent = await Zotero.File.getBinaryContentsAsync(
            file.path,
          );

          const boundary =
            "----WebKitFormBoundary" + Math.random().toString(16).slice(2);

          // 上传文件并获取文档ID
          const documentId = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(
              "POST",
              `${this.baseURL}/api/v1/datasets/${datasetId}/documents`,
            );
            xhr.setRequestHeader("Authorization", `Bearer ${this.apiKey}`);
            xhr.setRequestHeader(
              "Content-Type",
              `multipart/form-data; boundary=${boundary}`,
            );

            // 构建请求主体
            let requestBody = `--${boundary}\r\n`;
            requestBody += `Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`;
            requestBody += `Content-Type: ${file.mimeType}\r\n\r\n`;

            // 转换为二进制数据
            const encoder = new TextEncoder();
            const headerBytes = encoder.encode(requestBody);
            const footerBytes = encoder.encode(`\r\n--${boundary}--\r\n`);

            const contentBytes = new Uint8Array(fileContent.length);
            for (let i = 0; i < fileContent.length; i++) {
              contentBytes[i] = fileContent.charCodeAt(i) & 0xff;
            }

            const body = new Uint8Array(
              headerBytes.length + contentBytes.length + footerBytes.length,
            );
            body.set(headerBytes, 0);
            body.set(contentBytes, headerBytes.length);
            body.set(footerBytes, headerBytes.length + contentBytes.length);

            xhr.onload = function () {
              if (xhr.status === 200) {
                try {
                  const response = JSON.parse(xhr.responseText);
                  if (response.code === ApiErrorCode.Success) {
                    // 解析返回的文档ID
                    if (
                      response.data &&
                      Array.isArray(response.data) &&
                      response.data.length > 0
                    ) {
                      const docId = response.data[0].id;
                      if (docId) {
                        resolve(docId);
                        return;
                      }
                    }
                    reject(new Error("无法从响应中提取文档ID"));
                  } else {
                    if (
                      response.message &&
                      response.message.includes(
                        "This type of file has not been supported yet",
                      )
                    ) {
                      reject(new Error(`文件类型不支持: ${file.name}`));
                    } else {
                      reject(
                        new Error(response.message || `上传文件失败: API错误`),
                      );
                    }
                  }
                } catch (e) {
                  reject(
                    new Error(
                      `解析响应失败: ${e instanceof Error ? e.message : String(e)}`,
                    ),
                  );
                }
              } else {
                reject(
                  new Error(
                    `上传文件HTTP错误: ${xhr.status} ${xhr.statusText}`,
                  ),
                );
              }
            };

            xhr.onerror = () => reject(new Error("网络错误"));
            xhr.send(body);
          });

          uploadedDocumentIds.push(documentId);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes("文件类型不支持") ||
            errorMessage.includes(
              "This type of file has not been supported yet",
            )
          ) {
            continue;
          }
          throw new Error(`上传文件 ${file.name} 时出错: ${errorMessage}`);
        }
      }

      if (uploadedDocumentIds.length === 0) {
        throw new Error("没有可处理的文档。所有上传的文件类型可能均不被支持。");
      }

      // 解析文档
      await this.parseDocuments(datasetId, uploadedDocumentIds);

      return { datasetId, documentIds: uploadedDocumentIds };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`创建数据集并上传文件时出错: ${errorMessage}`);
    }
  }

  /**
   * 获取数据集中的文档 ID 列表
   */
  private async getDocumentIds(datasetId: string): Promise<string[]> {
    try {
      const url = `${this.baseURL}/api/v1/datasets/${datasetId}/documents?page=1&page_size=100`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `获取文档列表HTTP错误: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result =
        (await response.json()) as RAGFlowAPIResponse<DocumentListResponse>;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `获取文档列表失败 (错误码: ${result.code})`,
        );
      }

      if (!result.data?.docs || !Array.isArray(result.data.docs)) {
        throw new Error("获取文档列表失败: 响应数据结构不正确");
      }

      return result.data.docs.map((doc) => doc.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 解析文档（处理文档）
   */
  private async parseDocuments(
    datasetId: string,
    documentIds: string[],
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/v1/datasets/${datasetId}/chunks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            document_ids: documentIds,
          }),
        },
      );

      const result = (await response.json()) as RAGFlowAPIResponse;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `解析文档失败 (错误码: ${result.code})`,
        );
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 检查数据集处理状态
   */
  public async checkDatasetStatus(datasetId: string): Promise<{
    processed: number;
    total: number;
    finished: boolean;
  }> {
    try {
      // 修改为使用查询参数id的接口
      const response = await fetch(
        `${this.baseURL}/api/v1/datasets?id=${datasetId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      const result = (await response.json()) as RAGFlowAPIResponse<
        DatasetResponse[]
      >;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `获取数据集状态失败 (错误码: ${result.code})`,
        );
      }

      // 检查返回的数据是否为数组且不为空
      if (
        !result.data ||
        !Array.isArray(result.data) ||
        result.data.length === 0
      ) {
        throw new Error(`找不到ID为 ${datasetId} 的数据集`);
      }

      // 使用返回数组中的第一个元素（应该只有一个元素）
      const dataset = result.data[0];
      const processed = dataset.chunk_count || 0;
      const total = dataset.document_count * 10; // 粗略估计每个文档约10个块
      const finished = dataset.status === KnowledgeBaseStatus.Ready;

      return { processed, total, finished };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 创建聊天助手
   */
  public async createChatAssistant(
    datasetId: string,
    name: string,
    params?: ChatAssistantParams,
  ): Promise<string> {
    try {
      const requestBody: any = {
        dataset_ids: [datasetId],
        name: name,
      };

      if (params) {
        requestBody.llm = {
          model_name: params.model,
          temperature: params.temperature,
          top_p: params.top_p,
          max_tokens: params.max_tokens,
        };

        requestBody.prompt = {
          similarity_threshold: params.similarity_threshold,
          top_n: params.top_n,
        };
      }

      const response = await fetch(`${this.baseURL}/api/v1/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const result =
        (await response.json()) as RAGFlowAPIResponse<ChatAssistantResponse>;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `创建聊天助手失败 (错误码: ${result.code})`,
        );
      }

      return result.data.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 更新聊天助手
   */
  public async updateChatAssistant(
    chatId: string,
    name: string,
    params?: ChatAssistantParams,
  ): Promise<boolean> {
    try {
      const existingAssistant = await this.getChatAssistantDetails(chatId);

      const requestBody: any = {
        name: name,
      };

      if (params) {
        requestBody.llm = {
          model_name:
            params.model ||
            existingAssistant.llm?.model_name ||
            "deepseek-chat",
          temperature: params.temperature,
          top_p: params.top_p,
          max_tokens: params.max_tokens,
        };

        if (existingAssistant.llm) {
          if (existingAssistant.llm.presence_penalty !== undefined) {
            requestBody.llm.presence_penalty =
              existingAssistant.llm.presence_penalty;
          }
          if (existingAssistant.llm.frequency_penalty !== undefined) {
            requestBody.llm.frequency_penalty =
              existingAssistant.llm.frequency_penalty;
          }
        }

        requestBody.prompt = {
          similarity_threshold: params.similarity_threshold,
          top_n: params.top_n,
        };

        if (existingAssistant.prompt) {
          if (
            existingAssistant.prompt.keywords_similarity_weight !== undefined
          ) {
            requestBody.prompt.keywords_similarity_weight =
              existingAssistant.prompt.keywords_similarity_weight;
          }
          if (existingAssistant.prompt.variables) {
            requestBody.prompt.variables = existingAssistant.prompt.variables;
          }
          if (existingAssistant.prompt.empty_response) {
            requestBody.prompt.empty_response =
              existingAssistant.prompt.empty_response;
          }
          if (existingAssistant.prompt.opener) {
            requestBody.prompt.opener = existingAssistant.prompt.opener;
          }
        }
      }

      const response = await fetch(`${this.baseURL}/api/v1/chats/${chatId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const result = (await response.json()) as RAGFlowAPIResponse;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `更新聊天助手失败 (错误码: ${result.code})`,
        );
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 获取聊天助手详情
   */
  public async getChatAssistantDetails(
    chatId: string,
  ): Promise<ChatAssistantResponse> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/v1/chats?id=${chatId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      const result = (await response.json()) as RAGFlowAPIResponse<
        ChatAssistantResponse[]
      >;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `获取聊天助手详情失败 (错误码: ${result.code})`,
        );
      }

      if (!result.data || result.data.length === 0) {
        throw new Error("找不到指定的聊天助手");
      }

      return result.data[0];
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 创建聊天会话
   */
  public async createSession(
    chatId: string,
    name: string = "Zotero问答会话",
  ): Promise<string> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/v1/chats/${chatId}/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            name: name,
          }),
        },
      );

      const result =
        (await response.json()) as RAGFlowAPIResponse<SessionResponse>;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `创建会话失败 (错误码: ${result.code})`,
        );
      }

      return result.data.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 向 RAGFlow 发送问题并获取回答
   */
  public async sendMessage(
    chatId: string,
    sessionId: string,
    question: string,
  ): Promise<{
    answer: string;
    sources: Array<{ content: string; document_name: string }>;
  }> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/v1/chats/${chatId}/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            question: question,
            session_id: sessionId,
            stream: false,
          }),
        },
      );

      const responseText = await response.text();

      const result = JSON.parse(
        responseText,
      ) as RAGFlowAPIResponse<CompletionResponse>;

      // 检查API返回的错误码
      if (result.code !== ApiErrorCode.Success) {
        switch (result.code) {
          case ApiErrorCode.InsufficientBalance:
            throw new Error(
              "RAGFlow API 账户余额不足，请登录 RAGFlow 平台充值后再试",
            );
          default:
            throw new Error(result.message || "获取回答失败");
        }
      }

      if (!result.data || !result.data.answer) {
        throw new Error("获取回答失败，返回数据格式不正确");
      }

      const answer = result.data.answer;
      const sources: Array<{ content: string; document_name: string }> = [];

      if (result.data.reference?.chunks) {
        result.data.reference.chunks.forEach((chunk) => {
          sources.push({
            content: chunk.content,
            document_name: chunk.document_name || "未知文档",
          });
        });
      }

      return { answer, sources };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 再次检查错误消息中是否包含余额不足信息
      if (
        errorMessage.includes("402") ||
        errorMessage.includes("Insufficient Balance") ||
        errorMessage.includes("余额不足")
      ) {
        throw new Error(
          "RAGFlow API 账户余额不足，请登录 RAGFlow 平台充值后再试",
        );
      }

      throw error;
    }
  }

  /**
   * 获取知识库列表
   */
  public async listDatasets(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/v1/datasets?page=1&page_size=100`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      const result = (await response.json()) as RAGFlowAPIResponse<
        DatasetResponse[]
      >;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `获取数据集列表失败 (错误码: ${result.code})`,
        );
      }

      return result.data.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 获取知识库状态
   */
  public async getKnowledgeBaseStatus(
    datasetId: string,
  ): Promise<KnowledgeBaseStatusType> {
    try {
      const statusData = await this.checkDatasetStatus(datasetId);

      if (statusData.finished) {
        return KnowledgeBaseStatus.Ready;
      } else if (statusData.processed > 0) {
        return KnowledgeBaseStatus.Processing;
      } else {
        const response = await fetch(
          `${this.baseURL}/api/v1/datasets/${datasetId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
          },
        );

        const result =
          (await response.json()) as RAGFlowAPIResponse<DatasetResponse>;

        if (result.code !== ApiErrorCode.Success) {
          throw new Error(
            result.message || `获取数据集信息失败 (错误码: ${result.code})`,
          );
        }

        return result.data.status as KnowledgeBaseStatusType;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 删除知识库数据集
   * @param datasetId 数据集ID
   */
  public async deleteDataset(datasetId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseURL}/api/v1/datasets`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          ids: [datasetId],
        }),
      });

      const result = (await response.json()) as RAGFlowAPIResponse;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `删除数据集失败 (错误码: ${result.code})`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`删除数据集 ${datasetId} 失败: ${errorMessage}`);
    }
  }

  /**
   * 删除知识库中的文档
   * @param datasetId 数据集ID
   * @param documentId 文档ID
   */
  public async deleteDocument(
    datasetId: string,
    documentId: string,
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/v1/datasets/${datasetId}/documents`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            ids: [documentId],
          }),
        },
      );

      const result = (await response.json()) as RAGFlowAPIResponse;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `删除文档失败 (错误码: ${result.code})`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`删除文档 ${documentId} 失败: ${errorMessage}`);
    }
  }

  /**
   * 更新知识库配置
   * @param datasetId 数据集ID
   * @param config 更新配置
   */
  public async updateDataset(
    datasetId: string,
    config: {
      name?: string;
      embedding_model?: string;
      chunk_method?: string;
    },
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/v1/datasets/${datasetId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(config),
        },
      );

      const result = (await response.json()) as RAGFlowAPIResponse;

      if (result.code !== ApiErrorCode.Success) {
        throw new Error(
          result.message || `更新数据集失败 (错误码: ${result.code})`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`更新数据集 ${datasetId} 失败: ${errorMessage}`);
    }
  }

  /**
   * 更新知识库中的文档内容
   * 根据API文档，需要先删除原文档，然后上传新文档
   * @param datasetId 数据集ID
   * @param documentId 文档ID
   * @param filePath 新文件路径
   * @param fileName 文件名
   * @param mimeType 文件MIME类型
   */
  public async updateDocument(
    datasetId: string,
    documentId: string,
    filePath: string,
    fileName: string,
    mimeType: string,
  ): Promise<void> {
    try {
      // 先检查文件类型是否支持
      const isHTML =
        mimeType === "text/html" ||
        filePath.toLowerCase().endsWith(".html") ||
        filePath.toLowerCase().endsWith(".htm");
      const isSnapshot =
        fileName.includes("Snapshot") || filePath.includes("Snapshot");

      if (isHTML || isSnapshot) {
        throw new Error("不支持的文件类型: HTML或快照文件");
      }

      // 删除旧文档
      try {
        await this.deleteDocument(datasetId, documentId);
      } catch (error) {
        // 如果文档不存在，忽略这个错误
        if (
          !(
            error instanceof Error &&
            (error.message.includes("not found") ||
              error.message.includes("文档不存在"))
          )
        ) {
          throw error;
        }
      }

      // 上传新文档
      // 读取文件内容
      const fileContent = await Zotero.File.getBinaryContentsAsync(filePath);

      // 使用multipart/form-data上传文件
      const boundary =
        "----WebKitFormBoundary" + Math.random().toString(16).slice(2);
      const headers = new Headers();
      headers.append("Authorization", `Bearer ${this.apiKey}`);
      headers.append(
        "Content-Type",
        `multipart/form-data; boundary=${boundary}`,
      );

      // 构建请求主体
      let requestBody = `--${boundary}\r\n`;
      requestBody += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
      requestBody += `Content-Type: ${mimeType}\r\n\r\n`;

      // 转换为二进制数据
      const encoder = new TextEncoder();
      const headerBytes = encoder.encode(requestBody);
      const footerBytes = encoder.encode(`\r\n--${boundary}--\r\n`);

      const contentBytes = new Uint8Array(fileContent.length);
      for (let i = 0; i < fileContent.length; i++) {
        contentBytes[i] = fileContent.charCodeAt(i) & 0xff;
      }

      const body = new Uint8Array(
        headerBytes.length + contentBytes.length + footerBytes.length,
      );
      body.set(headerBytes, 0);
      body.set(contentBytes, headerBytes.length);
      body.set(footerBytes, headerBytes.length + contentBytes.length);

      // 发送请求到文档上传API
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `${this.baseURL}/api/v1/datasets/${datasetId}/documents`,
        );
        xhr.setRequestHeader("Authorization", `Bearer ${this.apiKey}`);
        xhr.setRequestHeader(
          "Content-Type",
          `multipart/form-data; boundary=${boundary}`,
        );

        xhr.onload = function () {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.code === ApiErrorCode.Success) {
                resolve();
              } else {
                reject(
                  new Error(response.message || `上传新文档失败: API错误`),
                );
              }
            } catch (e) {
              reject(
                new Error(
                  `解析响应失败: ${e instanceof Error ? e.message : String(e)}`,
                ),
              );
            }
          } else {
            reject(
              new Error(`上传新文档HTTP错误: ${xhr.status} ${xhr.statusText}`),
            );
          }
        };

        xhr.onerror = () => reject(new Error("网络错误"));
        xhr.send(body);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw error; // 直接抛出原始错误以保留错误类型
    }
  }
}

// 导出单例实例
export const ragflow = new RAGFlowService();
