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
  designStyle: 1 | 2 | 3 | 4;
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

// Function to get the opposite color
const getOppositeColor = (color: string): string => {
  const hsl = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!hsl) return color;
  const h = parseInt(hsl[1]);
  const s = parseInt(hsl[2]);
  const l = parseInt(hsl[3]);
  return `hsl(${(h + 180) % 360}, ${s}%, ${l}%)`;
};

// Function to blend two HSL colors based on a ratio
const getBlendedColor = (
  color1: string,
  color2: string,
  ratio: number
): string => {
  // Extract HSL values from both colors
  const color1Match = color1.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  const color2Match = color2.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);

  if (!color1Match || !color2Match) return color1;

  // Parse HSL values
  const h1 = parseInt(color1Match[1]);
  const s1 = parseInt(color1Match[2]);
  const l1 = parseInt(color1Match[3]);

  const h2 = parseInt(color2Match[1]);
  const s2 = parseInt(color2Match[2]);
  const l2 = parseInt(color2Match[3]);

  // Ensure ratio is between 0 and 1
  const blend = Math.max(0, Math.min(1, ratio));

  // Blend each component
  const h = h1 + (h2 - h1) * blend;
  const s = s1 + (s2 - s1) * blend;
  const l = l1 + (l2 - l1) * blend;

  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
};
const getSegmentColor = (player: Player, segmentIndex: number): string => {
  const baseColor = player.color;
  const position = segmentIndex % 10; // 10 segments in a full cycle

  switch (player.designStyle) {
    case 1: // Style 1: Alternating between normal and dark
      return segmentIndex % 2 === 0 ? baseColor : darkenColor(baseColor, 15);

    case 2: // Style 2: Gradient pattern (light → dark → light)
      // 5-segment cycle: 0,1,2,3,4 where 0 is lightest and 4 is darkest
      const darkening =
        position < 5
          ? position * 10 // Gradually darken for first 5 segments (0-40)
          : (9 - position) * 10; // Gradually lighten for next 5 segments (40-0)
      return darkenColor(baseColor, darkening);

    case 3: // Style 3: Color, darker, darkest pattern
      const patternPosition = segmentIndex % 3;
      if (patternPosition === 0) return baseColor;
      if (patternPosition === 1) return darkenColor(baseColor, 15);
      return darkenColor(baseColor, 30); // darkest

    case 4:
      // choose another color that is opposite of the base color but with same lightness
      const oppositeColor = getOppositeColor(baseColor);
      const snakeLength = player.snake.length;
      const blend = segmentIndex / snakeLength;

      // const blend = position < 5 ? position / 5 : (9 - position) / 5;
      return getBlendedColor(baseColor, oppositeColor, blend);

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
  const [joinedAt, setJoinedAt] = useState<number | null>(null); // Track when the current player joined

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
      setJoinedAt(Date.now()); // Set joinedAt when the player connects
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

      // Handle direction changes
      let newDirection: Direction | null = null;
      if (e.key === "ArrowUp") newDirection = "UP";
      else if (e.key === "ArrowDown") newDirection = "DOWN";
      else if (e.key === "ArrowLeft") newDirection = "LEFT";
      else if (e.key === "ArrowRight") newDirection = "RIGHT";

      if (newDirection) {
        socket.emit("changeDirection", newDirection);
      }

      // Handle color change with 'c' key
      if (e.key === "c" || e.key === "C") {
        socket.emit("changeAppearance");
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

      // Draw indicator circle ONLY for the current player's snake
      if (id === myId && joinedAt) {
        const timeElapsed = Date.now() - joinedAt;
        const INDICATOR_DURATION = 15000; // 15 seconds in milliseconds

        if (timeElapsed < INDICATOR_DURATION) {
          const head = player.snake[0];

          // Calculate opacity: start with 1.0 (fully opaque) and fade out in the last 5 seconds
          let opacity = 1.0;
          if (timeElapsed > INDICATOR_DURATION - 5000) {
            // Linear fade out in the last 5 seconds
            opacity = (INDICATOR_DURATION - timeElapsed) / 5000;
          }

          // Draw red circle around the snake's head
          ctx.beginPath();
          ctx.arc(
            head.x * cellWidth + cellWidth / 2, // x center
            head.y * cellHeight + cellHeight / 2, // y center
            Math.max(cellWidth, cellHeight) * 2, // radius slightly larger than the cell
            0, // start angle
            Math.PI * 2 // end angle (full circle)
          );
          ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
          ctx.lineWidth = 4;
          ctx.stroke();
        } else if (timeElapsed < INDICATOR_DURATION * 2) {
          // Calculate opacity for second 15 seconds: fade from 1.0 to 0.0
          const opacity =
            (INDICATOR_DURATION * 2 - timeElapsed) / INDICATOR_DURATION;

          // Draw red circle around the snake's head with fading opacity
          const head = player.snake[0];
          ctx.beginPath();
          ctx.arc(
            head.x * cellWidth + cellWidth / 2,
            head.y * cellHeight + cellHeight / 2,
            Math.max(cellWidth, cellHeight) * 2,
            0,
            Math.PI * 2
          );
          ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      }
    }
  }, [gameState, canvasSize, myId, joinedAt]);

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
          fontSize: "18px",
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
                width: "14px",
                height: "14px",
                background: player.color,
                marginRight: "5px",
              }}
            ></span>
            <span
              style={{
                fontWeight: player.id === myId ? "bold" : "normal",
                color: player.id === myId ? "#FFFFFF" : "inherit",
              }}
            >
              {player.score}
              {player.isAI ? " (AI)" : ""}
              {player.id === myId ? " (You)" : ""}
            </span>
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
