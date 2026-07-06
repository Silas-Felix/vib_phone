local Tunnel = module('vrp', 'lib/Tunnel')
local Proxy = module('vrp', 'lib/Proxy')
vRP = Proxy.getInterface('vRP')

local activeCalls = {}
local DB = { ready = false, driver = 'none' }
local SQL = {}

local function dbg(msg) if Config.Debug then print('^2[vib_phone]^0 '..tostring(msg)) end end
local function cleanNumber(n) return tostring(n or ''):gsub('%s+', ''):sub(1, 20) end
local function now() return os.time() end

local function resourceStarted(name)
    return GetResourceState(name) == 'started'
end

local function detectDbDriver()
    if resourceStarted('oxmysql') then return 'oxmysql' end
    if resourceStarted('mysql-async') then return 'mysql-async' end
    if resourceStarted('ghmattimysql') then return 'ghmattimysql' end
    return 'none'
end

local function dbExecute(sql, params, cb)
    sql = SQL[sql] or sql
    params = params or {}
    if DB.driver == 'oxmysql' then
        exports.oxmysql:execute(sql, params, function(result)
            if cb then cb(result) end
        end)
    elseif DB.driver == 'mysql-async' then
        exports['mysql-async']:mysql_execute(sql, params, function(result)
            if cb then cb(result) end
        end)
    elseif DB.driver == 'ghmattimysql' then
        exports.ghmattimysql:execute(sql, params, function(result)
            if cb then cb(result) end
        end)
    else
        print('^1[vib_phone]^0 Ingen SQL-driver fundet. Start oxmysql, mysql-async eller ghmattimysql før vib_mobile/vib_phone.')
        if cb then cb(nil) end
    end
end

local function dbQuery(sql, params, cb)
    sql = SQL[sql] or sql
    params = params or {}
    if DB.driver == 'oxmysql' then
        exports.oxmysql:query(sql, params, function(result)
            cb(result or {})
        end)
    elseif DB.driver == 'mysql-async' then
        exports['mysql-async']:mysql_fetch_all(sql, params, function(result)
            cb(result or {})
        end)
    elseif DB.driver == 'ghmattimysql' then
        exports.ghmattimysql:execute(sql, params, function(result)
            cb(result or {})
        end)
    else
        print('^1[vib_phone]^0 Ingen SQL-driver fundet. Start oxmysql, mysql-async eller ghmattimysql før vib_mobile/vib_phone.')
        cb({})
    end
end

local function sqlInit()
    DB.driver = detectDbDriver()
    if DB.driver == 'none' then
        DB.ready = false
        print('^1[vib_phone]^0 SQL kunne ikke starte: ingen database-driver fundet. Tilføj fx ensure oxmysql før ensure vib_mobile.')
        return
    end

    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_users(
            user_id INT NOT NULL PRIMARY KEY,
            phone_number VARCHAR(20) NOT NULL UNIQUE,
            display_name VARCHAR(80) DEFAULT NULL,
            wallpaper INT DEFAULT 1,
            created_at INT DEFAULT 0
        )
    ]])
    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_contacts(
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            name VARCHAR(80) NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            company VARCHAR(80) DEFAULT '',
            nickname VARCHAR(80) DEFAULT '',
            notes TEXT,
            created_at INT DEFAULT 0,
            updated_at INT DEFAULT 0,
            INDEX(owner_id), INDEX(phone_number)
        )
    ]])
    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_messages(
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            sender_number VARCHAR(20) NOT NULL,
            receiver_number VARCHAR(20) NOT NULL,
            message TEXT NOT NULL,
            sent_at INT NOT NULL,
            read_by_receiver TINYINT DEFAULT 0,
            INDEX(sender_number), INDEX(receiver_number), INDEX(sent_at)
        )
    ]])
    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_tweets(
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            display_name VARCHAR(80) NOT NULL,
            text VARCHAR(280) NOT NULL,
            created_at INT NOT NULL,
            INDEX(created_at)
        )
    ]])
    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_twitter_accounts(
            user_id INT NOT NULL PRIMARY KEY,
            username VARCHAR(32) NOT NULL UNIQUE,
            password VARCHAR(128) NOT NULL,
            created_at INT NOT NULL
        )
    ]])
    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_twitter_posts(
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            username VARCHAR(32) NOT NULL,
            title VARCHAR(80) NOT NULL,
            text TEXT NOT NULL,
            image_url TEXT,
            created_at INT NOT NULL,
            INDEX(created_at), INDEX(user_id)
        )
    ]])
    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_twitter_comments(
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL,
            user_id INT NOT NULL,
            username VARCHAR(32) NOT NULL,
            text TEXT NOT NULL,
            created_at INT NOT NULL,
            INDEX(post_id), INDEX(created_at)
        )
    ]])
    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_call_logs(
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            other_number VARCHAR(20) NOT NULL,
            other_name VARCHAR(80) DEFAULT '',
            direction VARCHAR(20) NOT NULL,
            status VARCHAR(20) DEFAULT 'completed',
            started_at INT NOT NULL,
            ended_at INT DEFAULT 0,
            duration INT DEFAULT 0,
            INDEX(owner_id), INDEX(other_number), INDEX(started_at)
        )
    ]])
    SQL['vib_phone/get_user'] = 'SELECT * FROM vib_phone_users WHERE user_id = @user_id'
    SQL['vib_phone/get_number'] = 'SELECT user_id FROM vib_phone_users WHERE phone_number = @phone_number'
    SQL['vib_phone/insert_user'] = 'INSERT IGNORE INTO vib_phone_users(user_id, phone_number, display_name, wallpaper, created_at) VALUES(@user_id,@phone_number,@display_name,@wallpaper,@created_at)'
    SQL['vib_phone/update_display'] = 'UPDATE vib_phone_users SET display_name=@display_name WHERE user_id=@user_id'
    SQL['vib_phone/update_user_phone'] = 'UPDATE vib_phone_users SET phone_number=@phone_number, display_name=@display_name WHERE user_id=@user_id'
    SQL['vib_phone/set_wallpaper'] = 'UPDATE vib_phone_users SET wallpaper=@wallpaper WHERE user_id=@user_id'
    SQL['vib_phone/get_contacts'] = 'SELECT * FROM vib_phone_contacts WHERE owner_id=@owner_id ORDER BY name ASC'
    SQL['vib_phone/find_contact'] = 'SELECT * FROM vib_phone_contacts WHERE owner_id=@owner_id AND phone_number=@phone_number LIMIT 1'
    SQL['vib_phone/upsert_contact'] = [[
        INSERT INTO vib_phone_contacts(owner_id,name,phone_number,company,nickname,notes,created_at,updated_at)
        VALUES(@owner_id,@name,@phone_number,@company,@nickname,@notes,@created_at,@updated_at)
    ]]
    SQL['vib_phone/update_contact_by_number'] = [[
        UPDATE vib_phone_contacts SET name=@name, phone_number=@new_number, company=@company, nickname=@nickname, notes=@notes, updated_at=@updated_at
        WHERE owner_id=@owner_id AND phone_number=@old_number
    ]]
    SQL['vib_phone/delete_contact'] = 'DELETE FROM vib_phone_contacts WHERE owner_id=@owner_id AND phone_number=@phone_number'
    SQL['vib_phone/get_messages'] = [[
        SELECT * FROM vib_phone_messages
        WHERE sender_number=@phone_number OR receiver_number=@phone_number
        ORDER BY sent_at DESC, id DESC
        LIMIT @limit
    ]]
    SQL['vib_phone/insert_message'] = 'INSERT INTO vib_phone_messages(sender_number, receiver_number, message, sent_at, read_by_receiver) VALUES(@sender,@receiver,@message,@sent_at,0)'
    SQL['vib_phone/read_conversation'] = [[
        UPDATE vib_phone_messages SET read_by_receiver=1
        WHERE receiver_number=@me AND sender_number=@other
    ]]
    SQL['vib_phone/insert_tweet'] = 'INSERT INTO vib_phone_tweets(user_id, phone_number, display_name, text, created_at) VALUES(@user_id,@phone_number,@display_name,@text,@created_at)'
    SQL['vib_phone/get_tweets'] = 'SELECT * FROM vib_phone_tweets ORDER BY created_at DESC, id DESC LIMIT @limit'
    SQL['vib_phone/twitter_get_account'] = 'SELECT * FROM vib_phone_twitter_accounts WHERE user_id=@user_id LIMIT 1'
    SQL['vib_phone/twitter_get_username'] = 'SELECT user_id FROM vib_phone_twitter_accounts WHERE username=@username LIMIT 1'
    dbExecute([[
        CREATE TABLE IF NOT EXISTS vib_phone_photos(
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            image_data MEDIUMTEXT NOT NULL,
            created_at INT NOT NULL,
            INDEX(owner_id), INDEX(created_at)
        )
    ]])

    SQL['vib_phone/twitter_insert_account'] = 'INSERT INTO vib_phone_twitter_accounts(user_id,username,password,created_at) VALUES(@user_id,@username,@password,@created_at)'
    SQL['vib_phone/twitter_insert_post'] = 'INSERT INTO vib_phone_twitter_posts(user_id,username,title,text,image_url,created_at) VALUES(@user_id,@username,@title,@text,@image_url,@created_at)'
    SQL['vib_phone/twitter_get_posts'] = 'SELECT * FROM vib_phone_twitter_posts ORDER BY created_at DESC, id DESC LIMIT @limit'
    SQL['vib_phone/twitter_get_comments'] = 'SELECT * FROM vib_phone_twitter_comments ORDER BY created_at ASC, id ASC LIMIT @limit'
    SQL['vib_phone/twitter_insert_comment'] = 'INSERT INTO vib_phone_twitter_comments(post_id,user_id,username,text,created_at) VALUES(@post_id,@user_id,@username,@text,@created_at)'
    SQL['vib_phone/twitter_delete_post'] = 'DELETE FROM vib_phone_twitter_posts WHERE id=@id AND user_id=@user_id'
    SQL['vib_phone/twitter_delete_post_comments'] = 'DELETE FROM vib_phone_twitter_comments WHERE post_id=@id'
    SQL['vib_phone/insert_photo'] = 'INSERT INTO vib_phone_photos(owner_id,image_data,created_at) VALUES(@owner_id,@image_data,@created_at)'
    SQL['vib_phone/get_photos'] = 'SELECT id,image_data,created_at FROM vib_phone_photos WHERE owner_id=@owner_id ORDER BY created_at DESC, id DESC LIMIT @limit'
    SQL['vib_phone/delete_photos'] = 'DELETE FROM vib_phone_photos WHERE owner_id=@owner_id AND id IN (@ids)'
    SQL['vib_phone/insert_call_log'] = 'INSERT INTO vib_phone_call_logs(owner_id, other_number, other_name, direction, status, started_at, ended_at, duration) VALUES(@owner_id,@other_number,@other_name,@direction,@status,@started_at,@ended_at,@duration)'
    SQL['vib_phone/get_call_logs'] = 'SELECT * FROM vib_phone_call_logs WHERE owner_id=@owner_id ORDER BY started_at DESC, id DESC LIMIT @limit'
    SQL['vib_phone/delete_call_log'] = 'DELETE FROM vib_phone_call_logs WHERE id=@id AND owner_id=@owner_id'

    DB.ready = true
    print('^2[vib_phone]^0 SQL phone loaded using '..DB.driver..'.')
end

local function requireDbReady(src)
    if DB.ready then return true end
    if src then TriggerClientEvent('vib_phone:toast', src, 'Telefonens database er ikke startet.') end
    return false
end

local function identityFromTable(identity, user_id)
    identity = identity or {}
    local first = identity.firstname or identity.firstName or identity.forename or identity.first_name or ''
    local last = identity.name or identity.lastname or identity.lastName or identity.last_name or identity.surname or ''
    local display = (tostring(first)..' '..tostring(last)):gsub('^%s*(.-)%s*$', '%1')
    if display == '' then
        display = identity.fullname or identity.full_name or identity.display_name or identity.username or nil
    end

    local phone = nil
    local candidates = {
        identity.phone, identity.phone_number, identity.phonenumber, identity.telephone,
        identity.tel, identity.number, identity.mobile, identity.phoneNumber
    }
    for _,v in ipairs(candidates) do
        local n = cleanNumber(v)
        if n ~= '' and #n >= 4 then phone = n break end
    end

    return {
        name = (display and tostring(display) ~= '' and tostring(display)) or ('Borger #'..tostring(user_id)),
        phone = phone
    }
end

local function getProxyIdentity(user_id)
    local out = nil
    pcall(function()
        local identity = vRP.getUserIdentity({user_id})
        if identity then out = identityFromTable(identity, user_id) end
    end)
    return out
end

-- Henter Devo/vRP karakterens rigtige navn og telefonnummer.
-- Først prøves vRP identity, derefter direkte SQL i vrp_user_identities.
local function fetchIdentityData(user_id, cb)
    local proxyIdentity = getProxyIdentity(user_id) or { name = 'Borger #'..tostring(user_id), phone = nil }

    -- De fleste Devo/vRP builds bruger vrp_user_identities med phone/firstname/name.
    dbQuery('SELECT * FROM vrp_user_identities WHERE user_id = @user_id LIMIT 1', {user_id=user_id}, function(rows)
        if rows and rows[1] then
            local sqlIdentity = identityFromTable(rows[1], user_id)
            if sqlIdentity.phone or (sqlIdentity.name and not tostring(sqlIdentity.name):find('Borger #')) then
                cb({
                    name = sqlIdentity.name or proxyIdentity.name,
                    phone = sqlIdentity.phone or proxyIdentity.phone
                })
                return
            end
        end
        cb(proxyIdentity)
    end)
end

local function generatedNumber(user_id)
    local prefix = tostring(Config.PhoneNumberPrefix or '58')
    local len = tonumber(Config.PhoneNumberLength or 8)
    local rest = math.max(1, len - #prefix)
    local n = tostring(user_id)
    if #n > rest then n = n:sub(-rest) end
    return prefix .. string.rep('0', rest-#n) .. n
end

local function ensureUser(user_id, cb)
    fetchIdentityData(user_id, function(identityData)
        local display = identityData.name or ('Borger #'..tostring(user_id))
        local identityPhone = cleanNumber(identityData.phone)
        if identityPhone == '' then identityPhone = nil end

        dbQuery('vib_phone/get_user', {user_id=user_id}, function(rows)
            if rows and rows[1] then
                local current = cleanNumber(rows[1].phone_number)
                if identityPhone and identityPhone ~= current then
                    -- Brug altid karakterens rigtige Devo/vRP nummer, hvis det findes og ikke ejes af en anden bruger.
                    dbQuery('vib_phone/get_number', {phone_number=identityPhone}, function(ownerRows)
                        if not ownerRows or not ownerRows[1] or tonumber(ownerRows[1].user_id) == tonumber(user_id) then
                            dbExecute('vib_phone/update_user_phone', {user_id=user_id, phone_number=identityPhone, display_name=display})
                            rows[1].phone_number = identityPhone
                            rows[1].display_name = display
                            cb(rows[1])
                        else
                            dbExecute('vib_phone/update_display', {user_id=user_id, display_name=display})
                            rows[1].display_name = display
                            cb(rows[1])
                        end
                    end)
                else
                    dbExecute('vib_phone/update_display', {user_id=user_id, display_name=display})
                    rows[1].display_name = display
                    if identityPhone then rows[1].phone_number = identityPhone end
                    cb(rows[1])
                end
            else
                local number = identityPhone or generatedNumber(user_id)
                dbExecute('vib_phone/insert_user', {user_id=user_id, phone_number=number, display_name=display, wallpaper=Config.DefaultWallpaper or 1, created_at=now()}, function()
                    cb({user_id=user_id, phone_number=number, display_name=display, wallpaper=Config.DefaultWallpaper or 1})
                end)
            end
        end)
    end)
end

local function getUserByNumber(number, cb)
    number = cleanNumber(number)
    dbQuery('vib_phone/get_number', {phone_number=number}, function(rows)
        if rows and rows[1] then cb(tonumber(rows[1].user_id)) else cb(nil) end
    end)
end

local function buildMessages(myNumber, rows)
    local conversations = {}
    rows = rows or {}
    for i=#rows,1,-1 do
        local m = rows[i]
        local other = tostring(m.sender_number) == tostring(myNumber) and tostring(m.receiver_number) or tostring(m.sender_number)
        local key = tostring(myNumber < other and (myNumber..':'..other) or (other..':'..myNumber))
        conversations[key] = conversations[key] or { number = other, items = {}, unread = false }
        table.insert(conversations[key].items, {
            id = tonumber(m.id), from = m.sender_number, to = m.receiver_number, text = m.message,
            time = os.date('%H:%M', tonumber(m.sent_at) or now()), stamp = tonumber(m.sent_at) or now()
        })
        if tostring(m.receiver_number) == tostring(myNumber) and tonumber(m.read_by_receiver or 0) == 0 then conversations[key].unread = true end
        while #conversations[key].items > (Config.MaxMessagesPerConversation or 120) do table.remove(conversations[key].items, 1) end
    end
    return conversations
end

local function getPhoneData(src, cb)
    if not requireDbReady(src) then return cb(nil) end
    local user_id = vRP.getUserId({src})
    if not user_id then return cb(nil) end
    ensureUser(user_id, function(u)
        dbQuery('vib_phone/get_contacts', {owner_id=user_id}, function(contacts)
            dbQuery('vib_phone/get_messages', {phone_number=u.phone_number, limit=600}, function(messages)
                dbQuery('vib_phone/twitter_get_account', {user_id=user_id}, function(accRows)
                    local twitterAccount = nil
                    if accRows and accRows[1] then twitterAccount = { username = accRows[1].username } end
                    dbQuery('vib_phone/twitter_get_posts', {limit=30}, function(posts)
                        dbQuery('vib_phone/twitter_get_comments', {limit=300}, function(commentRows)
                            local commentMap = {}
                            for _,cm in ipairs(commentRows or {}) do
                                local pid = tonumber(cm.post_id)
                                commentMap[pid] = commentMap[pid] or {}
                                table.insert(commentMap[pid], { id=tonumber(cm.id), username=cm.username, text=cm.text, time=os.date('%H:%M', tonumber(cm.created_at) or now()), date=os.date('%d/%m %H:%M', tonumber(cm.created_at) or now()), stamp=tonumber(cm.created_at) or now() })
                            end
                            local outTweets = {}
                            for _,t in ipairs(posts or {}) do
                                table.insert(outTweets, { id=tonumber(t.id), user_id=tonumber(t.user_id), username=t.username, name=t.username, title=t.title, text=t.text, image_url=t.image_url, time=os.date('%H:%M', tonumber(t.created_at) or now()), date=os.date('%d/%m/%Y %H:%M', tonumber(t.created_at) or now()), stamp=tonumber(t.created_at) or now(), comments=commentMap[tonumber(t.id)] or {} })
                            end
                            dbQuery('vib_phone/get_photos', {owner_id=user_id, limit=60}, function(photoRows)
                                local outPhotos = {}
                                for _,p in ipairs(photoRows or {}) do
                                    table.insert(outPhotos, { id=tonumber(p.id), image=p.image_data, image_data=p.image_data, time=os.date('%H:%M', tonumber(p.created_at) or now()), date=os.date('%d/%m/%Y %H:%M', tonumber(p.created_at) or now()), stamp=tonumber(p.created_at) or now() })
                                end
                                dbQuery('vib_phone/get_call_logs', {owner_id=user_id, limit=150}, function(callRows)
                                    local outCalls = {}
                                    for _,c in ipairs(callRows or {}) do
                                        table.insert(outCalls, {
                                            id=tonumber(c.id), other_number=c.other_number, other_name=c.other_name,
                                            direction=c.direction, status=c.status, started_at=tonumber(c.started_at) or now(),
                                            ended_at=tonumber(c.ended_at) or 0, duration=tonumber(c.duration) or 0
                                        })
                                    end
                                    cb({
                                        user_id = user_id,
                                        number = u.phone_number,
                                        name = u.display_name or ('Borger #'..tostring(user_id)),
                                        contacts = contacts or {},
                                        messages = buildMessages(u.phone_number, messages or {}),
                                        tweets = outTweets,
                                        twitterAccount = twitterAccount,
                                        callLogs = outCalls,
                                        photos = outPhotos,
                                        settings = { wallpaper = tonumber(u.wallpaper) or 1 },
                                        time = os.date('%H:%M')
                                    })
                                end)
                            end)
                        end)
                    end)
                end)
            end)
        end)
    end)
end

local function sendData(src)
    getPhoneData(src, function(data)
        if data then TriggerLatentClientEvent('vib_phone:receiveData', src, 250000, data) end
    end)
end

local function notify(src, payload)
    if Config.Notifications.enabled then TriggerClientEvent('vib_phone:pushNotification', src, payload) end
end

local sqlStartThreadRunning = false

local function startSqlWhenReady()
    if DB.ready or sqlStartThreadRunning then return end
    sqlStartThreadRunning = true

    CreateThread(function()
        local warned = false

        while not DB.ready do
            local driver = detectDbDriver()

            if driver ~= 'none' then
                sqlInit()
                break
            end

            if not warned then
                print('^3[vib_phone]^0 Venter på SQL-driver (oxmysql/mysql-async/ghmattimysql) før telefonen starter...')
                warned = true
            end

            Wait(500)
        end

        sqlStartThreadRunning = false
    end)
end

AddEventHandler('onResourceStart', function(res)
    if res == GetCurrentResourceName() then
        startSqlWhenReady()
    elseif res == 'oxmysql' or res == 'mysql-async' or res == 'ghmattimysql' then
        startSqlWhenReady()
    end
end)

RegisterServerEvent('vib_phone:requestData')
AddEventHandler('vib_phone:requestData', function() sendData(source) end)

RegisterServerEvent('vib_phone:saveContact')
AddEventHandler('vib_phone:saveContact', function(payload)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    payload = payload or {}
    local oldNumber = cleanNumber(payload.oldNumber)
    local newNumber = cleanNumber(payload.number)
    local firstName = tostring(payload.firstName or ''):gsub('^%s*(.-)%s*$', '%1')
    local lastName = tostring(payload.lastName or ''):gsub('^%s*(.-)%s*$', '%1')
    local builtName = (firstName..' '..lastName):gsub('^%s*(.-)%s*$', '%1')
    local name = tostring(payload.name or ''):gsub('^%s*(.-)%s*$', '%1'):sub(1,80)
    if name == '' and builtName ~= '' then name = builtName:sub(1,80) end
    if newNumber == '' and oldNumber ~= '' then newNumber = oldNumber end
    if name == '' then name = newNumber end
    if newNumber == '' then
        TriggerClientEvent('vib_phone:toast', src, 'Kontakt kunne ikke gemmes: mangler telefonnummer.')
        return
    end
    local params = {owner_id=user_id, old_number=oldNumber, new_number=newNumber, phone_number=newNumber, name=name, company=tostring(payload.company or ''):sub(1,80), nickname=tostring(payload.nickname or ''):sub(1,80), notes=tostring(payload.notes or ''):sub(1,1000), created_at=now(), updated_at=now()}
    dbQuery('vib_phone/find_contact', {owner_id=user_id, phone_number=oldNumber ~= '' and oldNumber or newNumber}, function(rows)
        if rows and rows[1] then
            dbExecute('vib_phone/update_contact_by_number', params, function() sendData(src) end)
        else
            dbExecute('vib_phone/upsert_contact', params, function() sendData(src) end)
        end
    end)
end)

RegisterServerEvent('vib_phone:addContact')
AddEventHandler('vib_phone:addContact', function(name, number)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    local newNumber = cleanNumber(number)
    local cname = tostring(name or ''):sub(1,80)
    if cname == '' then cname = newNumber end
    if newNumber == '' then return end
    local params = {owner_id=user_id, phone_number=newNumber, name=cname, company='', nickname='', notes='', created_at=now(), updated_at=now()}
    dbExecute('vib_phone/upsert_contact', params, function() sendData(src) end)
end)

RegisterServerEvent('vib_phone:deleteContact')
AddEventHandler('vib_phone:deleteContact', function(number)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    dbExecute('vib_phone/delete_contact', {owner_id=user_id, phone_number=cleanNumber(number)}, function() sendData(src) end)
end)

RegisterServerEvent('vib_phone:sendMessage')
AddEventHandler('vib_phone:sendMessage', function(toNumber, text)
    local src = source
    if not requireDbReady(src) then return end
    local fromId = vRP.getUserId({src}); if not fromId then return end
    text = tostring(text or ''):sub(1,500)
    if text:gsub('%s+','') == '' then return end
    ensureUser(fromId, function(fromUser)
        local receiver = cleanNumber(toNumber)
        getUserByNumber(receiver, function(toId)
            if not toId then TriggerClientEvent('vib_phone:toast', src, 'Nummeret findes ikke.'); return end
            dbExecute('vib_phone/insert_message', {sender=fromUser.phone_number, receiver=receiver, message=text, sent_at=now()}, function()
                sendData(src)
                local targetSrc = vRP.getUserSource({toId})
                if targetSrc and tonumber(targetSrc) ~= tonumber(src) then
                    sendData(targetSrc)
                    notify(targetSrc, { app='Beskeder', title=fromUser.display_name or fromUser.phone_number, text=text })
                elseif targetSrc then
                    sendData(targetSrc)
                end
            end)
        end)
    end)
end)

RegisterServerEvent('vib_phone:readConversation')
AddEventHandler('vib_phone:readConversation', function(key)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    ensureUser(user_id, function(u)
        local other = tostring(key or ''):gsub(tostring(u.phone_number),''):gsub(':','')
        if other ~= '' then dbExecute('vib_phone/read_conversation', {me=u.phone_number, other=other}) end
    end)
end)


local function twitterUsernameFor(user_id, cb)
    dbQuery('vib_phone/twitter_get_account', {user_id=user_id}, function(rows)
        if rows and rows[1] then cb(rows[1].username) else cb(nil) end
    end)
end

local function refreshTwitterForAll(src, title, text)
    for _, player in ipairs(GetPlayers()) do
        local ps = tonumber(player)
        sendData(ps)
        if src and ps ~= src then notify(ps, { app='Twitter', title=title or 'Nyt opslag', text=text or '' }) end
    end
end

RegisterServerEvent('vib_phone:twitterRegister')
AddEventHandler('vib_phone:twitterRegister', function(payload)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    payload = payload or {}
    local username = tostring(payload.username or ''):gsub('%s+','_'):gsub('[^%w_%.%-]',''):sub(1,32)
    local password = tostring(payload.password or ''):sub(1,128)
    if #username < 3 or #password < 3 then TriggerClientEvent('vib_phone:toast', src, 'Ugyldigt username eller password.'); return end
    dbQuery('vib_phone/twitter_get_account', {user_id=user_id}, function(existing)
        if existing and existing[1] then sendData(src); return end
        dbQuery('vib_phone/twitter_get_username', {username=username}, function(rows)
            if rows and rows[1] then TriggerClientEvent('vib_phone:toast', src, 'Username er allerede taget.'); sendData(src); return end
            dbExecute('vib_phone/twitter_insert_account', {user_id=user_id, username=username, password=password, created_at=now()}, function() sendData(src) end)
        end)
    end)
end)

RegisterServerEvent('vib_phone:twitterPost')
AddEventHandler('vib_phone:twitterPost', function(payload)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    payload = payload or {}
    local title = tostring(payload.title or ''):sub(1,80)
    local text = tostring(payload.text or ''):sub(1,500)
    local image = tostring(payload.image or payload.image_url or ''):sub(1,500)
    if title:gsub('%s+','') == '' or text:gsub('%s+','') == '' then TriggerClientEvent('vib_phone:toast', src, 'Udfyld både overskrift og tekst.'); return end
    twitterUsernameFor(user_id, function(username)
        if not username then TriggerClientEvent('vib_phone:toast', src, 'Opret en Twitter-konto først.'); sendData(src); return end
        dbExecute('vib_phone/twitter_insert_post', {user_id=user_id, username=username, title=title, text=text, image_url=image, created_at=now()}, function(result)
            TriggerClientEvent('vib_phone:toast', src, 'Opslag sendt.')
            refreshTwitterForAll(src, '@'..username, title)
        end)
    end)
end)

RegisterServerEvent('vib_phone:twitterComment')
AddEventHandler('vib_phone:twitterComment', function(payload)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    payload = payload or {}
    local postId = tonumber(payload.postId or payload.post_id or 0)
    local text = tostring(payload.text or ''):sub(1,300)
    if not postId or postId <= 0 or text:gsub('%s+','') == '' then TriggerClientEvent('vib_phone:toast', src, 'Skriv en kommentar først.'); return end
    twitterUsernameFor(user_id, function(username)
        if not username then TriggerClientEvent('vib_phone:toast', src, 'Opret en Twitter-konto først.'); sendData(src); return end
        dbExecute('vib_phone/twitter_insert_comment', {post_id=postId, user_id=user_id, username=username, text=text, created_at=now()}, function(result)
            TriggerClientEvent('vib_phone:toast', src, 'Kommentar sendt.')
            refreshTwitterForAll(src, '@'..username, 'Kommenterede et opslag')
        end)
    end)
end)

RegisterServerEvent('vib_phone:twitterDeletePost')
AddEventHandler('vib_phone:twitterDeletePost', function(postId)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    postId = tonumber(postId or 0)
    if not postId or postId <= 0 then return end
    dbExecute('vib_phone/twitter_delete_post', {id=postId, user_id=user_id}, function(result)
        dbExecute('vib_phone/twitter_delete_post_comments', {id=postId}, function()
            TriggerClientEvent('vib_phone:toast', src, 'Opslag slettet.')
            refreshTwitterForAll(src, 'Twitter', 'Et opslag blev slettet')
        end)
    end)
end)

RegisterServerEvent('vib_phone:tweet')
AddEventHandler('vib_phone:tweet', function(text)
    TriggerEvent('vib_phone:twitterPost', {title='By-opslag', text=text, image=''})
end)


RegisterServerEvent('vib_phone:savePhoto')
AddEventHandler('vib_phone:savePhoto', function(imageData)
    local src=source
    if not requireDbReady(src) then return end
    local user_id=vRP.getUserId({src}); if not user_id then return end
    imageData=tostring(imageData or '')
    if imageData == '' then
        TriggerClientEvent('vib_phone:toast', src, 'Kameraet kunne ikke gemme billedet.')
        return
    end
    dbExecute('vib_phone/insert_photo', {owner_id=user_id, image_data=imageData, created_at=now()}, function()
        TriggerClientEvent('vib_phone:toast', src, 'Billede gemt i Fotos.')
        sendData(src)
    end)
end)


RegisterServerEvent('vib_phone:deletePhotos')
AddEventHandler('vib_phone:deletePhotos', function(ids)
    local src=source
    if not requireDbReady(src) then return end
    local user_id=vRP.getUserId({src}); if not user_id then return end
    if type(ids) ~= 'table' or #ids < 1 then return end
    local clean={}
    for _,id in ipairs(ids) do
        id=tonumber(id)
        if id then table.insert(clean, id) end
    end
    if #clean < 1 then return end
    local placeholders={}
    local params={owner_id=user_id}
    for i,id in ipairs(clean) do
        local k='id'..i
        placeholders[#placeholders+1]='@'..k
        params[k]=id
    end
    local sql='DELETE FROM vib_phone_photos WHERE owner_id=@owner_id AND id IN ('..table.concat(placeholders, ',')..')'
    dbExecute(sql, params, function()
        TriggerClientEvent('vib_phone:toast', src, 'Billede slettet.')
        sendData(src)
    end)
end)

RegisterServerEvent('vib_phone:setWallpaper')
AddEventHandler('vib_phone:setWallpaper', function(index)
    local src = source
    if not requireDbReady(src) then return end
    local user_id = vRP.getUserId({src}); if not user_id then return end
    index = tonumber(index) or 1
    if index < 1 or index > 6 then index = 1 end
    ensureUser(user_id, function()
        dbExecute('vib_phone/set_wallpaper', {user_id=user_id, wallpaper=index}, function() sendData(src) end)
    end)
end)


local function logCall(owner_id, other_number, other_name, direction, status, started_at, ended_at)
    local duration = 0
    if status == 'completed' and ended_at and started_at and ended_at > started_at then duration = ended_at - started_at end
    dbExecute('vib_phone/insert_call_log', {
        owner_id=owner_id,
        other_number=cleanNumber(other_number),
        other_name=tostring(other_name or ''):sub(1,80),
        direction=direction,
        status=status,
        started_at=started_at or now(),
        ended_at=ended_at or 0,
        duration=duration
    })
end

RegisterServerEvent('vib_phone:deleteCallLog')
AddEventHandler('vib_phone:deleteCallLog', function(id)
    local src=source
    if not requireDbReady(src) then return end
    local user_id=vRP.getUserId({src}); if not user_id then return end
    dbExecute('vib_phone/delete_call_log', {id=tonumber(id) or 0, owner_id=user_id}, function() sendData(src) end)
end)

RegisterServerEvent('vib_phone:startCall')
AddEventHandler('vib_phone:startCall', function(toNumber)
    local src = source
    if not requireDbReady(src) then return end
    local fromId = vRP.getUserId({src}); if not fromId then return end
    ensureUser(fromId, function(fromUser)
        getUserByNumber(toNumber, function(toId)
            if not toId then TriggerClientEvent('vib_phone:callFailed', src, 'Nummeret findes ikke.'); return end
            local targetSrc = vRP.getUserSource({toId})
            if not targetSrc then TriggerClientEvent('vib_phone:callFailed', src, 'Personen er ikke tilgængelig.'); return end
            ensureUser(toId, function(toUser)
                local callId = tostring(now())..':'..tostring(math.random(1000,9999))
                activeCalls[callId] = { from=fromId, to=toId, fromSrc=src, toSrc=targetSrc, active=false, speaker={}, startedAt=now(), answeredAt=0, fromNumber=fromUser.phone_number, toNumber=toUser.phone_number, fromName=fromUser.display_name or fromUser.phone_number, toName=toUser.display_name or toUser.phone_number }
                TriggerClientEvent('vib_phone:outgoingCall', src, { callId=callId, number=toUser.phone_number, name=toUser.display_name or toUser.phone_number })
                TriggerClientEvent('vib_phone:incomingCall', targetSrc, { callId=callId, number=fromUser.phone_number, name=fromUser.display_name or fromUser.phone_number })
            end)
        end)
    end)
end)

RegisterServerEvent('vib_phone:answerCall')
AddEventHandler('vib_phone:answerCall', function(callId)
    local c = activeCalls[callId]; if not c then return end
    c.active = true
    c.answeredAt = c.answeredAt ~= 0 and c.answeredAt or now()
    TriggerClientEvent('vib_phone:callActive', c.fromSrc, { callId=callId })
    TriggerClientEvent('vib_phone:callActive', c.toSrc, { callId=callId })
end)

RegisterServerEvent('vib_phone:endCall')
AddEventHandler('vib_phone:endCall', function(callId)
    local c = activeCalls[callId]
    if c then
        local ended = now()
        local status = c.active and 'completed' or 'missed'
        local startTime = c.answeredAt ~= 0 and c.answeredAt or c.startedAt
        logCall(c.from, c.toNumber, c.toName, 'outgoing', status, startTime, ended)
        logCall(c.to, c.fromNumber, c.fromName, 'incoming', status, startTime, ended)
        TriggerClientEvent('vib_phone:callEnded', c.fromSrc)
        TriggerClientEvent('vib_phone:callEnded', c.toSrc)
        activeCalls[callId] = nil
        if c.fromSrc then sendData(c.fromSrc) end
        if c.toSrc then sendData(c.toSrc) end
    end
end)

RegisterServerEvent('vib_phone:setSpeaker')
AddEventHandler('vib_phone:setSpeaker', function(callId, enabled)
    local src = source
    local c = activeCalls[callId]
    if c then c.speaker[src] = enabled == true end
end)
