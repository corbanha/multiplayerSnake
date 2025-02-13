// MultiplayerSnakeGame.tsx
import React, { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';

interface Point {
  x: number;
  y: number;
}

interface Player {
  id: string;
  snake: Point[];
  score: number;
  color: string;
}

interface GameState {
  players: Record<string, Player>;
  fruits: Point[];
  gridWidth: number;
  gridHeight: number;
}

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

const MultiplayerSnakeGame: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Connect to the Socket.IO server.
  useEffect(() => {
    const newSocket = io(`${process.env.domain || "http://mentalkoolaid.com:8080"}`);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      if(!newSocket.id) return;
      setMyId(newSocket.id);
    });

    newSocket.on('gameState', (state: GameState) => {
      setGameState(state);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Listen for key presses and send direction changes.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!socket) return;
      let newDirection: Direction | null = null;
      if (e.key === 'ArrowUp') newDirection = 'UP';
      else if (e.key === 'ArrowDown') newDirection = 'DOWN';
      else if (e.key === 'ArrowLeft') newDirection = 'LEFT';
      else if (e.key === 'ArrowRight') newDirection = 'RIGHT';
      if (newDirection) {
        socket.emit('changeDirection', newDirection);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [socket]);

  // Make the canvas fill the entire window.
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handleResize = () => {
      setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Render the game state onto the canvas.
  useEffect(() => {
    if (!gameState || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas.
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Compute the cell size based on the grid dimensions from the server.
    const cellWidth = canvasSize.width / gameState.gridWidth;
    const cellHeight = canvasSize.height / gameState.gridHeight;

    // Draw all fruits.
    ctx.fillStyle = 'red';
    for (const fruit of gameState.fruits) {
      ctx.fillRect(fruit.x * cellWidth, fruit.y * cellHeight, cellWidth, cellHeight);
    }

    // Draw all players’ snakes.
    for (const id in gameState.players) {
      const player = gameState.players[id];
      ctx.fillStyle = player.color;
      player.snake.forEach(segment => {
        ctx.fillRect(segment.x * cellWidth, segment.y * cellHeight, cellWidth, cellHeight);
      });
    }
  }, [gameState, canvasSize]);

  // Find the current player’s score.
  const myScore =
    gameState && myId && gameState.players[myId]
      ? gameState.players[myId].score
      : 0;

  return (
    <div>
      {/* Display the score at the top center */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'white',
          zIndex: 1,
          fontSize: '24px'
        }}
      >
        Score: {myScore}
      </div>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ display: 'block', background: 'black' }}
      />
    </div>
  );
};

export default MultiplayerSnakeGame;
