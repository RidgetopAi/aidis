import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
}

export interface UseWebSocketOptions {
  onOpen?: (event: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface UseWebSocketReturn {
  socket: WebSocket | null;
  connectionState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  sendMessage: (message: any) => void;
  reconnect: () => void;
  disconnect: () => void;
  isConnected: boolean;
}

const useWebSocket = (
  url: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn => {
  const {
    onOpen,
    onMessage,
    onClose,
    onError,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10
  } = options;

  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'>('CLOSED');
  
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const connectionAttemptRef = useRef<Promise<void> | null>(null);
  const currentSocketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (!url || connectionAttemptRef.current || currentSocketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Close existing connection if any
    if (currentSocketRef.current) {
      currentSocketRef.current.close(1000, 'Reconnecting');
      currentSocketRef.current = null;
      setSocket(null);
    }

    connectionAttemptRef.current = new Promise<void>((resolve) => {
      try {
        const ws = new WebSocket(url);
        currentSocketRef.current = ws;
        
        setConnectionState('CONNECTING');

        ws.onopen = (event) => {
          console.log('WebSocket connected');
          setConnectionState('OPEN');
          setSocket(ws);
          reconnectAttemptsRef.current = 0;
          connectionAttemptRef.current = null;
          onOpen?.(event);
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            onMessage?.(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket disconnected', event.code, event.reason);
          setConnectionState('CLOSED');
          setSocket(null);
          currentSocketRef.current = null;
          connectionAttemptRef.current = null;
          onClose?.(event);

          // Only attempt to reconnect if not manually closed and should reconnect
          if (shouldReconnectRef.current && 
              event.code !== 1000 && // Not normal closure
              reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, reconnectInterval);
          }
          resolve();
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          onError?.(event);
          connectionAttemptRef.current = null;
          resolve();
        };

      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        setConnectionState('CLOSED');
        connectionAttemptRef.current = null;
        resolve();
      }
    });
  }, [url, onOpen, onMessage, onClose, onError, reconnectInterval, maxReconnectAttempts]);

  const sendMessage = useCallback((message: any) => {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket is not connected. Message not sent:', message);
    }
  }, [socket]);

  const reconnect = useCallback(() => {
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socket) {
      socket.close();
    }
    
    connect();
  }, [connect, socket]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (currentSocketRef.current) {
      setConnectionState('CLOSING');
      currentSocketRef.current.close(1000, 'Manual disconnect');
      currentSocketRef.current = null;
    }
    
    connectionAttemptRef.current = null;
    setSocket(null);
  }, []);

  useEffect(() => {
    if (url && !currentSocketRef.current) {
      shouldReconnectRef.current = true;
      connect();
    }

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (currentSocketRef.current) {
        currentSocketRef.current.close(1000, 'Component unmounting');
        currentSocketRef.current = null;
      }
      connectionAttemptRef.current = null;
    };
  }, [url, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const isConnected = connectionState === 'OPEN';

  return {
    socket,
    connectionState,
    sendMessage,
    reconnect,
    disconnect,
    isConnected
  };
};

export default useWebSocket;
