type Environment = {
  ENDPOINT: string;
}

const developmentConfig: Environment = {
  ENDPOINT: 'https://crucial-enabling-fox.ngrok-free.app',
};

const productionConfig: Environment = {
  ENDPOINT: 'https://flappy.krigga.dev',
}

export const environment: Environment =
  process.env.NODE_ENV === 'production'
    ? productionConfig
    : developmentConfig;
