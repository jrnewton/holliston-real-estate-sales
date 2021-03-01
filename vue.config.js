module.exports = {
  lintOnSave: 'error',

  configureWebpack: {
    resolve: {
      alias: {
        '@': __dirname + '/frontend/src'
      }
    },
    entry: {
      app: './frontend/src/main.js'
    }
  },

  chainWebpack: (config) => {
    config.plugin('html').tap((args) => {
      args[0].template = './frontend/public/index.html';
      args[0].title = 'Holliston Real Estate Sales';
      return args;
    });
  },

  transpileDependencies: ['vuetify']
};
