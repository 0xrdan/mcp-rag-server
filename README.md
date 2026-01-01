# MCP RAG Server

An MCP (Model Context Protocol) server that exposes RAG capabilities to Claude Code and other MCP clients.

> *This is a standalone extraction from my production portfolio site. See it in action at [danmonteiro.com](https://www.danmonteiro.com).*

---

## The Problem

You're using Claude Code but:

- **No access to your documents** — Claude can't search your knowledge base
- **Context is manual** — you're copy-pasting relevant docs into prompts
- **RAG is disconnected** — your vector database isn't accessible to AI tools
- **Integration is custom** — every project builds its own RAG bridge

## The Solution

MCP RAG Server provides:

- **Standard MCP interface** — works with Claude Code, Claude Desktop, and any MCP client
- **Full RAG pipeline** — hybrid search, query expansion, semantic chunking built-in
- **Simple tools** — `rag_query`, `rag_search`, `index_document`, `get_stats`
- **Zero config** — point at ChromaDB and go

```bash
# In Claude Code, after configuring the server:
"Search my knowledge base for articles about RAG architecture"
# Claude automatically uses rag_query tool and gets relevant context
```

## Results

From production usage:

| Without MCP RAG | With MCP RAG |
|-----------------|--------------|
| Manual context copy-paste | Automatic retrieval |
| No document search | Hybrid search built-in |
| Static knowledge | Live vector database |
| Custom integration per project | Standard MCP protocol |

---

## Design Philosophy

### Why MCP?

MCP (Model Context Protocol) standardizes how AI applications connect to external tools:

```
┌──────────────┐     MCP Protocol     ┌──────────────┐
│  MCP Client  │◀────────────────────▶│  MCP Server  │
│ (Claude Code)│                      │ (This repo)  │
└──────────────┘                      └──────────────┘
                                             │
                                      ┌──────▼──────┐
                                      │ RAG Pipeline │
                                      │  (ChromaDB)  │
                                      └─────────────┘
```

Instead of building custom integrations, MCP provides a universal interface that any MCP-compatible client can use.

### Tools Exposed

| Tool | Description |
|------|-------------|
| `rag_query` | Query with hybrid search, returns formatted context |
| `rag_search` | Raw similarity search, returns chunks with scores |
| `index_document` | Add a single document |
| `index_documents_batch` | Batch index multiple documents |
| `delete_by_source` | Delete all docs from a source |
| `get_stats` | Collection statistics |
| `clear_collection` | Clear all data (requires confirmation) |

---

## Quick Start

### 1. Prerequisites

```bash
# Start ChromaDB
docker run -p 8000:8000 chromadb/chroma

# Set OpenAI API key (for embeddings)
export OPENAI_API_KEY="sk-..."
```

### 2. Install & Build

```bash
git clone https://github.com/0xrdan/mcp-rag-server.git
cd mcp-rag-server
npm install
npm run build
```

### 3. Configure Claude Code

Add to your Claude Code MCP configuration (`~/.claude/mcp.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": ["/path/to/mcp-rag-server/dist/server.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "CHROMA_URL": "http://localhost:8000",
        "CHROMA_COLLECTION": "my_knowledge_base"
      }
    }
  }
}
```

### 4. Use in Claude Code

```bash
# Restart Claude Code to load the server
claude

# Now Claude has access to RAG tools:
"Index this document into my knowledge base: [paste content]"
"Search for information about transformer architectures"
"What do my docs say about error handling?"
```

---

## API Reference

### rag_query

Query the knowledge base with hybrid search. Returns formatted context suitable for LLM prompts.

```typescript
// Input
{
  question: string;      // Required: the question to search for
  topK?: number;         // Optional: number of results (default: 5)
  threshold?: number;    // Optional: min similarity 0-1 (default: 0.5)
  filters?: object;      // Optional: metadata filters
}

// Output
{
  context: string;       // Formatted context for LLM
  chunks: [{
    content: string;
    score: number;
    metadata: object;
  }];
  stats: {
    totalChunks: number;
    avgSimilarity: number;
  };
}
```

### rag_search

Raw similarity search without context formatting.

```typescript
// Input
{
  query: string;         // Required: search query
  topK?: number;         // Optional: number of results (default: 10)
  filters?: object;      // Optional: metadata filters
}

// Output: Array of chunks with scores
```

### index_document

Add a document to the knowledge base.

```typescript
// Input
{
  id: string;            // Required: unique identifier
  title: string;         // Required: document title
  content: string;       // Required: document content
  source: string;        // Required: source identifier
  category?: string;     // Optional: category
  tags?: string[];       // Optional: tags array
}

// Output
{
  success: boolean;
  documentId: string;
  chunksIndexed: number;
}
```

### get_stats

Get collection statistics.

```typescript
// Output
{
  totalChunks: number;
  totalDocuments: number;
  // ... other stats from RAG pipeline
}
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for embeddings |
| `CHROMA_URL` | No | `http://localhost:8000` | ChromaDB URL |
| `CHROMA_COLLECTION` | No | `mcp_knowledge_base` | Collection name |
| `EMBEDDING_MODEL` | No | `text-embedding-3-large` | Embedding model |
| `EMBEDDING_DIMENSIONS` | No | Native | Reduced dimensions |

---

## Project Structure

```
mcp-rag-server/
├── src/
│   ├── server.ts        # Main MCP server implementation
│   └── index.ts         # Exports
├── mcp-config.example.json  # Example Claude Code configuration
├── package.json
└── README.md
```

---

## Advanced Usage

### Programmatic Server Creation

```typescript
import { createServer } from 'mcp-rag-server';

const server = await createServer({
  vectorDB: {
    host: 'http://custom-chroma:8000',
    collectionName: 'my_collection',
  },
  rag: {
    topK: 10,
    enableHybridSearch: true,
  },
});
```

### Using with Claude Desktop

Same configuration works with Claude Desktop's MCP support:

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": ["/path/to/mcp-rag-server/dist/server.js"]
    }
  }
}
```

---

## Related Projects

- [rag-pipeline](https://github.com/0xrdan/rag-pipeline) - The underlying RAG implementation
- [topic-discovery](https://github.com/0xrdan/topic-discovery) - Multi-source topic aggregation
- [ai-orchestrator](https://github.com/0xrdan/ai-orchestrator) - Multi-model LLM routing

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/add-new-tool`)
3. Make changes with semantic commits
4. Open a PR with clear description

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

Built with [Claude Code](https://claude.ai/code).

```
Co-Authored-By: Claude <noreply@anthropic.com>
```
