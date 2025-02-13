import React from 'react';
import MultiplayerSnakeGame from './MultiplayerSnakeGame';

const App: React.FC = () => {
  // const [mode, setMode] = useState<'USER' | 'AI' | null>(null);

  // if (!mode) {
  //   return (
  //     <div style={{ textAlign: 'center', marginTop: '50px' }}>
  //       <h1>Snake Game</h1>
  //       <button
  //         onClick={() => setMode('USER')}
  //         style={{ margin: '10px', padding: '10px 20px' }}
  //       >
  //         Play as User
  //       </button>
  //       <button
  //         onClick={() => setMode('AI')}
  //         style={{ margin: '10px', padding: '10px 20px' }}
  //       >
  //         Watch AI Play
  //       </button>
  //     </div>
  //   );
  // }

  return <MultiplayerSnakeGame />;
};

export default App;
