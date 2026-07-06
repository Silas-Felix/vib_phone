fx_version '2.0.3-v72-control-center-rebuild'
game 'gta5'

name 'vib_phone'
author 'VIB / ChatGPT'
description 'Realistic iPhone style phone for vRP/Devo'
version '2.0.3-v72-control-center-rebuild'

ui_page 'html/index.html'

shared_scripts {
    'config.lua'
}

client_scripts {
    '@vrp/lib/utils.lua',
    'client.lua'
}

server_scripts {
    '@vrp/lib/utils.lua',
    'server.lua'
}

files {
    'html/index.html',
    'html/style.css',
    'html/app.js',
    'html/img/icons/*.*',
    'html/img/contact_icons/*.*',
    'html/img/photo_icons/*.*',
    'html/img/tabbar_icons/favorites.png',
    'html/img/tabbar_icons/recent.png',
    'html/img/tabbar_icons/contacts.png',
    'html/img/tabbar_icons/keypad.png',
    'html/img/tabbar_icons/voicemail.png',
    'html/img/tabbar_icons/*.png',
    'html/img/tabbar_icons/*.jpg',
    'html/img/tabbar_icons/*.jpeg',
    'html/img/tabbar_icons/*.webp',
    'html/img/tabbar_icons/*.svg',
    'html/img/wallpapers/*.jpg',
    'html/img/wallpapers/*.png'
}
