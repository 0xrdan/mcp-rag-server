#!/usr/bin/env node
/**
 * MCP RAG Server
 *
 * An MCP server that exposes RAG (Retrieval-Augmented Generation) capabilities
 * to Claude Code and other MCP clients.
 *
 * Tools:
 * - rag_query: Query the knowledge base with hybrid search
 * - rag_search: Search for similar documents
 * - index_document: Add a document to the knowledge base
 * - get_stats: Get collection statistics
 * - clear_collection: Clear all indexed data
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Pipeline, type DocumentInput, type PipelineConfig } from 'rag-pipeline';

// Tool definitions
const TOOLS = [
  {
    name: 'rag_query',
    description:
      'Query the knowledge base using hybrid search (vector similarity + keyword matching). Returns relevant chunks with a formatted context string suitable for LLM prompts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The question to search for',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default: 5)',
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity threshold 0-1 (default: 0.5)',
        },
        filters: {
          type: 'object',
          description: 'Optional metadata filters (e.g., {source: "docs"})',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'rag_search',
    description:
      'Search for similar documents without generating context. Returns raw chunk data with scores.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default: 10)',
        },
        filters: {
          type: 'object',
          description: 'Optional metadata filters',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'index_document',
    description:
      'Index a document into the knowledge base. The document will be chunked and embedded automatically.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'Unique document identifier',
        },
        title: {
          type: 'string',
          description: 'Document title',
        },
        content: {
          type: 'string',
          description: 'Document content (will be chunked)',
        },
        source: {
          type: 'string',
          description: 'Source identifier (e.g., "docs", "articles")',
        },
        category: {
          type: 'string',
          description: 'Optional category',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags array',
        },
      },
      required: ['id', 'title', 'content', 'source'],
    },
  },
  {
    name: 'index_documents_batch',
    description: 'Index multiple documents at once. More efficient than indexing one by one.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        documents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              content: { type: 'string' },
              source: { type: 'string' },
              category: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'title', 'content', 'source'],
          },
          description: 'Array of documents to index',
        },
      },
      required: ['documents'],
    },
  },
  {
    name: 'delete_by_source',
    description: 'Delete all documents from a specific source.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description: 'Source identifier to delete',
        },
      },
      required: ['source'],
    },
  },
  {
    name: 'get_stats',
    description: 'Get statistics about the indexed collection.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'clear_collection',
    description:
      'Clear all indexed data from the collection. Use with caution - this is destructive.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['confirm'],
    },
  },
];

/**
 * Create and configure the MCP RAG Server
 */
export async function createServer(config?: Partial<PipelineConfig>) {
  // Initialize the RAG pipeline
  const pipeline = new Pipeline({
    vectorDB: {
      host: process.env.CHROMA_URL || 'http://localhost:8000',
      collectionName: process.env.CHROMA_COLLECTION || 'mcp_knowledge_base',
    },
    embeddings: {
      model: (process.env.EMBEDDING_MODEL as any) || 'text-embedding-3-large',
      dimensions: process.env.EMBEDDING_DIMENSIONS
        ? parseInt(process.env.EMBEDDING_DIMENSIONS)
        : undefined,
    },
    rag: {
      topK: 5,
      threshold: 0.5,
      enableQueryExpansion: true,
      enableHybridSearch: true,
    },
    ...config,
  });

  // Create MCP server
  const server = new Server(
    {
      name: 'mcp-rag-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Track initialization state
  let initialized = false;

  /**
   * Ensure pipeline is initialized before operations
   */
  async function ensureInitialized() {
    if (!initialized) {
      await pipeline.initialize();
      initialized = true;
    }
  }

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      await ensureInitialized();

      switch (name) {
        case 'rag_query': {
          const { question, topK, threshold, filters } = args as {
            question: string;
            topK?: number;
            threshold?: number;
            filters?: Record<string, any>;
          };

          const result = await pipeline.query({
            question,
            topK,
            threshold,
            filters,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    context: result.context,
                    chunks: result.chunks.map((c) => ({
                      content: c.content,
                      score: c.score,
                      metadata: c.metadata,
                    })),
                    stats: result.stats,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'rag_search': {
          const { query, topK = 10, filters } = args as {
            query: string;
            topK?: number;
            filters?: Record<string, any>;
          };

          const result = await pipeline.query({
            question: query,
            topK,
            filters,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  result.chunks.map((c) => ({
                    content: c.content,
                    score: c.score,
                    documentId: c.metadata.documentId,
                    title: c.metadata.title,
                    source: c.metadata.source,
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'index_document': {
          const doc = args as DocumentInput;
          const chunksIndexed = await pipeline.indexDocument(doc);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  documentId: doc.id,
                  chunksIndexed,
                }),
              },
            ],
          };
        }

        case 'index_documents_batch': {
          const { documents } = args as { documents: DocumentInput[] };
          const totalChunks = await pipeline.indexDocuments(documents);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  documentsIndexed: documents.length,
                  totalChunks,
                }),
              },
            ],
          };
        }

        case 'delete_by_source': {
          const { source } = args as { source: string };
          await pipeline.deleteBySource(source);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Deleted all documents from source: ${source}`,
                }),
              },
            ],
          };
        }

        case 'get_stats': {
          const stats = await pipeline.getStats();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(stats, null, 2),
              },
            ],
          };
        }

        case 'clear_collection': {
          const { confirm } = args as { confirm: boolean };

          if (!confirm) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'Must set confirm: true to clear collection',
                  }),
                },
              ],
            };
          }

          await pipeline.clearAll();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: 'Collection cleared',
                }),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
              },
            ],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error.message,
              tool: name,
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Handle resource listing (expose stats as a resource)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'rag://stats',
          name: 'RAG Collection Statistics',
          description: 'Current statistics about the indexed knowledge base',
          mimeType: 'application/json',
        },
      ],
    };
  });

  // Handle resource reading
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'rag://stats') {
      await ensureInitialized();
      const stats = await pipeline.getStats();

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  return server;
}

/**
 * Main entry point - start the MCP server
 */
async function main() {
  try {
    const server = await createServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    // Log to stderr (stdout is used for MCP protocol)
    console.error('[mcp-rag-server] Server started');
  } catch (error) {
    console.error('[mcp-rag-server] Failed to start:', error);
    process.exit(1);
  }
}

// Run if this is the main module
main();
