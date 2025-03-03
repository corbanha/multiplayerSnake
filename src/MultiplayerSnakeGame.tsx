// MultiplayerSnakeGame.tsx
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";

interface Point {
  x: number;
  y: number;
}

interface Player {
  id: string;
  snake: Point[];
  score: number;
  color: string;
  // New properties for AI and death animation:
  isAI?: boolean;
  dead?: boolean;
  deathTimestamp?: number;
  designStyle: 1 | 2 | 3;
}

interface GameState {
  players: Record<string, Player>;
  fruits: Point[];
  gridWidth: number;
  gridHeight: number;
}

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

// Helper function to darken a color
const darkenColor = (color: string, amount: number): string => {
  // For HSL colors
  if (color.startsWith("hsl")) {
    const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
      const h = parseInt(match[1]);
      const s = parseInt(match[2]);
      const l = Math.max(parseInt(match[3]) - amount, 0); // Reduce lightness, but not below 0
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }

  // Fallback for other color formats (hex, rgb, etc.)
  return color;
};

// Function to get segment color based on design style
const getSegmentColor = (player: Player, segmentIndex: number): string => {
  const baseColor = player.color;

  console.log(player.designStyle);
  switch (player.designStyle) {
    case 1: // Style 1: Alternating between normal and dark
      return segmentIndex % 2 === 0 ? baseColor : darkenColor(baseColor, 30);

    case 2: // Style 2: Gradient pattern (light → dark → light)
      // 5-segment cycle: 0,1,2,3,4 where 0 is lightest and 4 is darkest
      const position = segmentIndex % 10; // 10 segments in a full cycle
      const darkening =
        position < 5
          ? position * 10 // Gradually darken for first 5 segments (0-40)
          : (9 - position) * 10; // Gradually lighten for next 5 segments (40-0)
      return darkenColor(baseColor, darkening);

    case 3: // Style 3: Color, darker, darkest pattern
      const patternPosition = segmentIndex % 3;
      if (patternPosition === 0) return baseColor;
      if (patternPosition === 1) return darkenColor(baseColor, 20);
      return darkenColor(baseColor, 40); // darkest

    default:
      return baseColor;
  }
};

const MultiplayerSnakeGame: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const highscoreBoardRef = useRef<HTMLDivElement | null>(null);
  const [boardOpacity, setBoardOpacity] = useState(1);

  // Connect to the Socket.IO server.
  useEffect(() => {
    console.log("Connecting to server!");
    const newSocket = io(
      process.env.SERVER_PORT
        ? `https://mentalkoolaid.com`
        : "http://localhost:3001"
    );
    setSocket(newSocket);

    newSocket.on("connect", () => {
      if (!newSocket.id) return;
      setMyId(newSocket.id);
    });

    newSocket.on("connect_error", (error: any) => {
      console.error("Connection error:", error);
    });

    newSocket.on("disconnect", (reason: string) => {
      console.warn("Disconnected from server:", reason);
    });

    newSocket.on("error", (error: any) => {
      console.error("Socket error:", error);
    });

    newSocket.on("gameState", (state: GameState) => {
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
      if (e.key === "ArrowUp") newDirection = "UP";
      else if (e.key === "ArrowDown") newDirection = "DOWN";
      else if (e.key === "ArrowLeft") newDirection = "LEFT";
      else if (e.key === "ArrowRight") newDirection = "RIGHT";
      if (newDirection) {
        socket.emit("changeDirection", newDirection);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [socket]);

  // Make the canvas fill the entire window.
  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const handleResize = () => {
      setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update AI player count based on human players.
  useEffect(() => {
    if (!socket || !gameState) return;
    const humanPlayers = Object.values(gameState.players).filter(
      (player) => !player.isAI
    );
    let desiredAICount = 0;
    if (humanPlayers.length === 1) desiredAICount = 3;
    else if (humanPlayers.length === 2) desiredAICount = 2;
    else if (humanPlayers.length === 3) desiredAICount = 1;
    else desiredAICount = 0;
    socket.emit("updateAICount", desiredAICount);
  }, [socket, gameState]);

  // Update highscore board opacity based on player's snake proximity.
  useEffect(() => {
    if (!gameState || !canvasRef.current || !highscoreBoardRef.current) return;
    const myPlayer = gameState.players[myId];
    if (!myPlayer) return;
    const cellWidth = canvasSize.width / gameState.gridWidth;
    const cellHeight = canvasSize.height / gameState.gridHeight;
    const boardRect = highscoreBoardRef.current.getBoundingClientRect();

    // Check if any segment of the player's snake overlaps the board.
    const isOverlapping = myPlayer.snake.some((segment) => {
      const segX = segment.x * cellWidth;
      const segY = segment.y * cellHeight;
      return (
        segX < boardRect.right &&
        segX + cellWidth > boardRect.left &&
        segY < boardRect.bottom &&
        segY + cellHeight > boardRect.top
      );
    });

    setBoardOpacity(isOverlapping ? 0 : 1);
  }, [gameState, canvasSize, myId]);

  // Render the game state onto the canvas.
  useEffect(() => {
    if (!gameState || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear the canvas.
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Compute the cell size based on grid dimensions.
    const cellWidth = canvasSize.width / gameState.gridWidth;
    const cellHeight = canvasSize.height / gameState.gridHeight;

    // Draw all fruits.
    ctx.fillStyle = "red";
    for (const fruit of gameState.fruits) {
      ctx.fillRect(
        fruit.x * cellWidth,
        fruit.y * cellHeight,
        cellWidth,
        cellHeight
      );
    }

    // Draw all players' snakes.
    for (const id in gameState.players) {
      const player = gameState.players[id];
      // Blinking death animation: if dead and within 2 seconds, only draw on alternating frames.
      if (player.dead && player.deathTimestamp) {
        const timeSinceDeath = Date.now() - player.deathTimestamp;
        if (timeSinceDeath < 2000) {
          if (Math.floor(Date.now() / 250) % 2 !== 0) {
            continue; // Skip drawing this frame.
          }
        } else {
          // After 2 seconds, do not draw the dead snake.
          continue;
        }
      }

      // Draw each segment with the proper color based on design style
      player.snake.forEach((segment, index) => {
        ctx.fillStyle = getSegmentColor(player, index);
        ctx.fillRect(
          segment.x * cellWidth,
          segment.y * cellHeight,
          cellWidth,
          cellHeight
        );
      });
    }
  }, [gameState, canvasSize]);

  // Find the current player's score.
  const myScore =
    gameState && myId && gameState.players[myId]
      ? gameState.players[myId].score
      : 0;

  // Prepare sorted high scores for display.
  const sortedScores =
    gameState && gameState.players
      ? Object.values(gameState.players).sort((a, b) => b.score - a.score)
      : [];

  return (
    <div>
      {/* Current player's score at the top center */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          color:
            gameState && myId && gameState.players[myId]
              ? gameState.players[myId].color
              : "white",
          zIndex: 2,
          fontSize: "24px",
        }}
      >
        Score: {myScore}
      </div>
      {/* Highscore board at the top right */}
      <div
        ref={highscoreBoardRef}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(0, 0, 0, 0.7)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          zIndex: 2,
          fontSize: "16px",
          opacity: boardOpacity,
          transition: "opacity 0.2s",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
          High Scores
        </div>
        {sortedScores.map((player) => (
          <div key={player.id}>
            <span
              style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                background: player.color,
                marginRight: "5px",
              }}
            ></span>
            {player.score}
            {player.isAI ? " (AI)" : ""}
          </div>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ display: "block", background: "black" }}
      />
    </div>
  );
};

export default MultiplayerSnakeGame;
