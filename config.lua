Config = {}

Config.Debug = false
Config.OpenKey = 288 -- F1
Config.Command = 'phone'
Config.RequireItem = false
Config.PhoneItem = 'phone'

Config.PhoneNumberPrefix = '58'
Config.PhoneNumberLength = 8

-- SQL version. Requires the same MySQL wrapper your vRP/Devo already uses.
Config.MaxMessagesPerConversation = 120
Config.MaxTwitterPosts = 30

Config.Notifications = {
    enabled = true,
    twitterToAll = true
}

Config.Animations = {
    phoneDict = 'cellphone@',
    phoneAnim = 'cellphone_text_read_base',
    callDict = 'cellphone@',
    callAnim = 'cellphone_call_listen_base',
    speakerDict = 'cellphone@',
    speakerAnim = 'cellphone_text_read_base'
}

Config.VoiceMode = 'visual'
Config.SpeakerRadius = 8.0

Config.DefaultWallpaper = 1
Config.Wallpapers = {
    'wallpaper1', 'wallpaper2', 'wallpaper3', 'wallpaper4', 'wallpaper5', 'wallpaper6'
}

Config.AppIcons = {
    settings = 'settings.png',
    camera = 'camera.png',
    photos = 'photos.png',
    calls = 'calls.png',
    contacts = 'contacts.png',
    messages = 'messages.png',
    twitter = 'twitter.png'
}
