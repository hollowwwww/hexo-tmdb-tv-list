/* global hexo */
'use strict';

var fs = require('hexo-fs');

var path = require('path');

var axios = require('axios');

var axios_item = require('axios');

var log = require('hexo-log')({
  debug: false,
  silent: false
});

if (typeof URL !== 'function') var _require2 = require('url'),
    URL = _require2.URL;
var options = {
  options: [{
    name: '-u, --update',
    desc: 'Update tmdb data'
  }, {
    name: '-d, --delete',
    desc: 'Delete tmdb data'
  }]
};
hexo.extend.generator.register('tmdbList', function (locals) {
  var _this$config, _this$config$tmdbList;

  if (!(this !== null && this !== void 0 && (_this$config = this.config) !== null && _this$config !== void 0 && (_this$config$tmdbList = _this$config.tmdbList) !== null && _this$config$tmdbList !== void 0 && _this$config$tmdbList.enable)) {
    return;
  }

  return require('./lib/tmdbList-generator').call(this, locals, 'tmdbList');
});
hexo.extend.console.register('tmdbList', 'Generate pages of tmdb list for Hexo', options, function (args) {
  if (args.d) {
    if (fs.existsSync(path.join(this.source_dir, '/_data/tmdbList.json'))) {
      fs.unlinkSync(path.join(this.source_dir, '/_data/tmdbList.json'));
      log.info('TMDB data has been deleted');
    }
  } else if (args.u) {
    var _this$config3, _this$config$tmdbList$;

    if (!(this !== null && this !== void 0 && (_this$config3 = this.config) !== null && _this$config3 !== void 0 && _this$config3.tmdbList)) {
      log.info('Please add config to _config.yml');
      return;
    }

    if (!this.config.tmdbList.enable) {
      return;
    }

    if (!this.config.tmdbList.listId) {
      log.info('Please add listId to _config.yml');
      return;
    }

    if (!this.config.tmdbList.api) {
      log.info('Please add api to _config.yml');
      return;
    }
    getTMDBData(this.config.tmdbList.listId, this.config.tmdbList.api, this.source_dir);
  } else {
    log.info('Unknown command, please use "hexo tmdbList -h" to see the available commands');
  }
});

async function getTMDBData(listId, api, dir) {
  log.info("Getting list items, please wait...");

  try {
    // 1. 分页获取列表全部条目（接口每页最多 20 条）
    const firstPageRes = await axios.get(
      `https://api.themoviedb.org/3/list/${listId}?api_key=${api}&language=zh-CN&page=1`
    );
    const totalPages = firstPageRes.data.total_pages;
    const maxPage = Math.min(totalPages, 500); // 服务端最多只允许访问 500 页
    let allListItems = [...firstPageRes.data.items];

    for (let page = 2; page <= maxPage; page++) {
      const pageRes = await axios.get(
        `https://api.themoviedb.org/3/list/${listId}?api_key=${api}&language=zh-CN&page=${page}`
      );
      allListItems = allListItems.concat(pageRes.data.items);
    }

    log.info(`Fetched ${allListItems.length} list items across ${maxPage} pages.`);

    // 2. 并行获取每部电影详情（append_to_response=credits 一次拿详情+演员）
    const detailResponses = await Promise.all(
      allListItems.map(item =>
        axios_item.get(
          `https://api.themoviedb.org/3/movie/${item.id}?api_key=${api}&language=zh-CN&append_to_response=credits`
        )
      )
    );

    // 3. 整理数据，取出 cast 前五个
    let data = [];
    for (const res of detailResponses) {
      const movie = res.data;

      // 取 cast 前五个，拼接姓名
      const topCast = (movie.credits?.cast || [])
        .sort((a, b) => a.order - b.order)
        .slice(0, 5)
        .map(actor => actor.name)
        .join(' / ');

      let item_data = {};
      item_data.id = movie.id;
      item_data.title = movie.title;
      item_data.date = movie.release_date;
      item_data.poster = movie.poster_path;
      item_data.bg = movie.backdrop_path;
      item_data.origin_title = movie.original_title;
      item_data.homepage = movie.homepage;
      item_data.genres = movie.genres;
      item_data.vote_average = movie.vote_average;   // 先保留数字，用于排序
      item_data.origin_country = movie.origin_country;
      item_data.cast = topCast;
      item_data.tagline = movie.tagline;

      data.push(item_data);
    }

    // 4. 按评分降序排序（高的在前）
    data.sort((a, b) => b.vote_average - a.vote_average);

    // 5. 排序完成后再把评分格式化为一位小数字符串
    data.forEach(item => {
      item.vote_average = item.vote_average.toFixed(1);
    });

    // 6. 写入文件
    fs.writeFileSync(
      path.join(dir, "/_data/tmdbList.json"),
      JSON.stringify(data)
    );
    log.info("tmdbList.json is saved.");

  } catch (err) {
    log.info("Failed to write data to tmdbList.json");
    console.error(err);
  }
}
