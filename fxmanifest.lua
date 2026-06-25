fx_version 'cerulean'
game 'gta5'
description 'Premium Glassmorphic Job & Faction Manager'
author 'chyaro group'
version '3.0.0'

client_scripts {
    'client/framework.lua',
    'client/marker.lua',
    'client/main.lua'
}

shared_scripts {
    'config/*.*',
    '@ox_lib/init.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/framework.lua',
    'server/main.lua'
}

ui_page 'html/index.html'

files {
    'locales/*.json',
    'html/index.html',
    'html/css/style.css',
    'html/js/script.js'
}
