import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['lib/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['lib/web-utils.js'],
            thresholds: {
                lines: 90,
                functions: 90,
                branches: 85,
                statements: 90,
            },
        },
    },
});
