# AIDIS STDIO Mock Server - Architecture Diagram

## Current Architecture (Before Fix)

```
┌─────────────────────────────────────────────────────────────────┐
│                         AMPCODE EDITOR                          │
│                      (Uses STDIO Protocol)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ STDIO MCP Protocol
                             │ (JSON-RPC over stdin/stdout)
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   AIDIS STDIO MOCK SERVER                       │
│                  (aidis-stdio-mock.js)                          │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  tools/list Handler (HARDCODED)                       │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │  Returns static list:                                 │    │
│  │  • aidis_help                                         │    │
│  │  • aidis_ping                                         │    │
│  │  • context_store                                      │    │
│  │  • context_search                                     │    │
│  │  • project_current                                    │    │
│  │                                                        │    │
│  │  ❌ Missing 70 other tools!                           │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  tools/call Handler (Works Fine)                      │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │  1. Extract tool name + arguments                     │    │
│  │  2. Wrap in HTTP format                               │    │
│  │  3. Forward to HTTP bridge                            │    │
│  │  4. Translate response back to MCP                    │    │
│  └───────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP POST
                             │ /mcp/tools/{toolName}
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   HTTP BRIDGE (Port 8080)                       │
│               (claude-http-mcp-bridge.js)                       │
│                                                                 │
│  • Receives HTTP requests                                      │
│  • Calls AIDIS MCP Server via STDIO                            │
│  • Returns HTTP responses                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ STDIO MCP Protocol
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    AIDIS MCP SERVER                             │
│                  (mcp-server/src/server.ts)                     │
│                                                                 │
│  • 75 Tools Available                                          │
│  • PostgreSQL Database                                         │
│  • Embeddings via Transformers.js                             │
│  • All AIDIS functionality                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Proposed Architecture (After Fix)

```
┌─────────────────────────────────────────────────────────────────┐
│                         AMPCODE EDITOR                          │
│                      (Uses STDIO Protocol)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ STDIO MCP Protocol
                             │ (JSON-RPC over stdin/stdout)
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   AIDIS STDIO MOCK SERVER                       │
│                  (aidis-stdio-mock.js)                          │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  Startup Sequence (NEW!)                              │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │  1. Server starts                                     │    │
│  │  2. toolCache = null (lazy load)                      │    │
│  │  3. Wait for first tools/list request                 │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  tools/list Handler (DYNAMIC!)                        │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │  if (!toolCache) {                                    │    │
│  │    toolCache = fetchAvailableTools()                  │    │
│  │      ├─→ Call aidis_help via HTTP bridge             │    │
│  │      ├─→ Parse tool list from response               │    │
│  │      └─→ Generate 75 tool definitions                │    │
│  │  }                                                     │    │
│  │  return toolCache  // 75 tools!                       │    │
│  │                                                        │    │
│  │  Fallback: If fetch fails → 10 essential tools        │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  tools/call Handler (Unchanged)                       │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │  Works for all 75 tools                               │    │
│  │  No special handling needed                           │    │
│  └───────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP POST
                             │ /mcp/tools/{toolName}
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   HTTP BRIDGE (Port 8080)                       │
│               (claude-http-mcp-bridge.js)                       │
│                                                                 │
│  • Receives HTTP requests                                      │
│  • Calls AIDIS MCP Server via STDIO                            │
│  • Returns HTTP responses                                      │
│  • Works with all 75 tools                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ STDIO MCP Protocol
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    AIDIS MCP SERVER                             │
│                  (mcp-server/src/server.ts)                     │
│                                                                 │
│  • 75 Tools Available                                          │
│  • PostgreSQL Database                                         │
│  • Embeddings via Transformers.js                             │
│  • All AIDIS functionality                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Tool Discovery Flow (Detailed)

```
┌──────────────┐
│  Ampcode     │
│  Starts      │
└──────┬───────┘
       │
       │ [1] Initialize MCP Connection
       ↓
┌──────────────────────────────┐
│  Mock Server                 │
│  Constructor runs            │
│  this.toolCache = null       │
└──────┬───────────────────────┘
       │
       │ [2] First tools/list Request
       ↓
┌──────────────────────────────┐
│  Check toolCache             │
│  if (!toolCache) {           │
└──────┬───────────────────────┘
       │
       │ [3] Fetch Tool List
       ↓
┌───────────────────────────────────────────┐
│  fetchAvailableTools()                    │
│                                           │
│  HTTP POST                                │
│  /mcp/tools/aidis_help                    │
│  {"arguments": {}}                        │
└──────┬────────────────────────────────────┘
       │
       │ [4] Response
       ↓
┌───────────────────────────────────────────┐
│  {                                        │
│    "success": true,                       │
│    "result": {                            │
│      "content": [{                        │
│        "text": "🚀 **AIDIS...**\n\n..."  │
│      }]                                   │
│    }                                      │
│  }                                        │
└──────┬────────────────────────────────────┘
       │
       │ [5] Parse Tools
       ↓
┌───────────────────────────────────────────┐
│  parseToolsFromHelpText()                 │
│                                           │
│  Regex: /•\s+\*\*([a-z_]+)\*\*\s+-\s+/   │
│                                           │
│  Extract:                                 │
│  • aidis_ping                             │
│  • aidis_status                           │
│  • context_store                          │
│  ... (72 more)                            │
└──────┬────────────────────────────────────┘
       │
       │ [6] Generate Schemas
       ↓
┌───────────────────────────────────────────┐
│  [{                                       │
│    name: "aidis_ping",                    │
│    description: "Test connectivity...",   │
│    inputSchema: {                         │
│      type: "object",                      │
│      properties: {},                      │
│      additionalProperties: true           │
│    }                                      │
│  }, ...]                                  │
│                                           │
│  toolCache = 75 tool definitions          │
└──────┬────────────────────────────────────┘
       │
       │ [7] Return to Ampcode
       ↓
┌──────────────────────────────┐
│  Ampcode receives 75 tools   │
│  Populates tool palette       │
│  User can now use all tools   │
└──────────────────────────────┘
```

## Fallback Flow (When HTTP Bridge Down)

```
┌──────────────┐
│  Ampcode     │
│  Starts      │
└──────┬───────┘
       │
       │ [1] tools/list Request
       ↓
┌──────────────────────────────┐
│  fetchAvailableTools()       │
│  Try: aidis_help HTTP call   │
└──────┬───────────────────────┘
       │
       │ [2] HTTP Error
       ↓
┌──────────────────────────────┐
│  ❌ ECONNREFUSED             │
│     (Bridge not running)     │
└──────┬───────────────────────┘
       │
       │ [3] Catch Error
       ↓
┌──────────────────────────────┐
│  console.error(              │
│    "⚠️  Failed to fetch..."  │
│    "📋 Falling back..."      │
│  )                           │
└──────┬───────────────────────┘
       │
       │ [4] Fallback
       ↓
┌──────────────────────────────┐
│  getEssentialTools()         │
│                              │
│  Returns 10 tools:           │
│  • aidis_help                │
│  • aidis_ping                │
│  • aidis_explain             │
│  • aidis_examples            │
│  • context_store             │
│  • context_search            │
│  • context_get_recent        │
│  • project_current           │
│  • project_list              │
│  • session_status            │
└──────┬───────────────────────┘
       │
       │ [5] Return Essentials
       ↓
┌──────────────────────────────┐
│  Ampcode receives 10 tools   │
│  Degraded mode but usable    │
│  User can fix bridge later   │
└──────────────────────────────┘
```

## Data Flow: Tool Execution

```
┌──────────────────────────────────────────────────────────────┐
│  Ampcode: "Use metrics_get_dashboard for aidis project"     │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ [1] MCP Request
       ↓
┌──────────────────────────────────────────────────────────────┐
│  {                                                           │
│    "jsonrpc": "2.0",                                         │
│    "id": 42,                                                 │
│    "method": "tools/call",                                   │
│    "params": {                                               │
│      "name": "metrics_get_dashboard",                        │
│      "arguments": {                                          │
│        "projectId": "aidis"                                  │
│      }                                                       │
│    }                                                         │
│  }                                                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ [2] Mock Server Receives
       ↓
┌──────────────────────────────────────────────────────────────┐
│  handleToolCall(request)                                     │
│                                                              │
│  Extract:                                                    │
│    toolName = "metrics_get_dashboard"                        │
│    args = { projectId: "aidis" }                             │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ [3] Wrap for HTTP
       ↓
┌──────────────────────────────────────────────────────────────┐
│  HTTP POST                                                   │
│  /mcp/tools/metrics_get_dashboard                            │
│                                                              │
│  {                                                           │
│    "arguments": {                                            │
│      "projectId": "aidis"                                    │
│    }                                                         │
│  }                                                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ [4] HTTP Bridge Forwards
       ↓
┌──────────────────────────────────────────────────────────────┐
│  AIDIS MCP Server                                            │
│  Executes: handleMetricsDashboard({ projectId: "aidis" })   │
│                                                              │
│  Returns:                                                    │
│  {                                                           │
│    content: [{                                               │
│      type: "text",                                           │
│      text: "📊 Dashboard Data:\n..."                        │
│    }]                                                        │
│  }                                                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ [5] HTTP Bridge Wraps
       ↓
┌──────────────────────────────────────────────────────────────┐
│  HTTP Response                                               │
│  {                                                           │
│    "success": true,                                          │
│    "result": {                                               │
│      "content": [{                                           │
│        "type": "text",                                       │
│        "text": "📊 Dashboard Data:\n..."                    │
│      }]                                                      │
│    }                                                         │
│  }                                                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ [6] Mock Server Translates
       ↓
┌──────────────────────────────────────────────────────────────┐
│  MCP Response                                                │
│  {                                                           │
│    "jsonrpc": "2.0",                                         │
│    "id": 42,                                                 │
│    "result": {                                               │
│      "content": [{                                           │
│        "type": "text",                                       │
│        "text": "📊 Dashboard Data:\n..."                    │
│      }],                                                     │
│      "isError": false                                        │
│    }                                                         │
│  }                                                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ [7] Ampcode Displays
       ↓
┌──────────────────────────────────────────────────────────────┐
│  User sees metrics dashboard in Ampcode                      │
└──────────────────────────────────────────────────────────────┘
```

## Key Insights

### What Changes
- ✅ Tool discovery mechanism (static → dynamic)
- ✅ Number of exposed tools (5 → 75)
- ✅ Fallback behavior (none → 10 essential tools)

### What Stays the Same
- ✅ Tool execution logic (already works for all tools)
- ✅ HTTP bridge communication (proven reliable)
- ✅ MCP protocol compliance (standard JSON-RPC)
- ✅ Error handling patterns (established)

### Why It's Low Risk
- ✅ Tool execution unchanged (only discovery changed)
- ✅ Fallback ensures basic functionality always available
- ✅ Can rollback to original file in seconds
- ✅ No database changes, no schema migrations
- ✅ Pure JavaScript logic, no new dependencies

---

**See Also**:
- Full Investigation Report: `STDIO_MOCK_INVESTIGATION_REPORT.md`
- Quick Summary: `STDIO_MOCK_FIX_SUMMARY.md`
