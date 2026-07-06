local phoneOpen = false
local currentCall = nil
local inCall = false
local speaker = false
local typingInPhone = false
local phoneProp = nil
local nativeCameraActive = false
local nativeCameraFacing = 'back'
local nativeCameraZoom = 1.0
local cameraCaptureBusy = false
local scriptCamera = nil
local cameraHeading = 0.0
local cameraPitch = 0.0
local cameraSelfie = false

local function loadAnim(dict)
    RequestAnimDict(dict)
    local timeout = GetGameTimer() + 1500
    while not HasAnimDictLoaded(dict) and GetGameTimer() < timeout do Citizen.Wait(10) end
    return HasAnimDictLoaded(dict)
end

local function playPhoneAnim(kind)
    local ped = PlayerPedId()
    local dict, anim = Config.Animations.phoneDict, Config.Animations.phoneAnim
    if kind == 'call' then dict, anim = Config.Animations.callDict, Config.Animations.callAnim end
    if kind == 'speaker' then dict, anim = Config.Animations.speakerDict, Config.Animations.speakerAnim end
    if loadAnim(dict) then
        TaskPlayAnim(ped, dict, anim, 3.0, -1, -1, 50, 0, false, false, false)
    end
end

local function stopPhoneAnim()
    ClearPedSecondaryTask(PlayerPedId())
end

local function createPhoneProp()
    if phoneProp then return end
    local ped = PlayerPedId()
    local model = GetHashKey('prop_amb_phone')
    RequestModel(model)
    while not HasModelLoaded(model) do Citizen.Wait(10) end
    phoneProp = CreateObject(model, 0.0, 0.0, 0.0, true, true, false)
    AttachEntityToEntity(phoneProp, ped, GetPedBoneIndex(ped, 28422), 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true, true, false, true, 1, true)
end

local function deletePhoneProp()
    if phoneProp then
        DeleteEntity(phoneProp)
        phoneProp = nil
    end
end


local function playCameraAnim()
    local ped = PlayerPedId()
    -- Forsøger først en mere kamera/selfie-lignende telefonanimation.
    -- Hvis den ikke findes på artifact/build, falder den bare tilbage til normal telefonanimation.
    if loadAnim('cellphone@self') then
        TaskPlayAnim(ped, 'cellphone@self', 'selfie', 3.0, -1, -1, 50, 0, false, false, false)
    else
        playPhoneAnim('phone')
    end
end

local function clamp(v, mn, mx)
    if v < mn then return mn end
    if v > mx then return mx end
    return v
end

local function rotToForward(heading, pitch)
    local h = math.rad(heading)
    local p = math.rad(pitch)
    return vector3(-math.sin(h) * math.cos(p), math.cos(h) * math.cos(p), math.sin(p))
end

local function updateScriptCamera()
    if not nativeCameraActive or not scriptCamera then return end

    local ped = PlayerPedId()
    local pedCoords = GetEntityCoords(ped)
    local head = pedCoords + vector3(0.0, 0.0, 0.72)

    if nativeCameraFacing == 'front' then
        cameraSelfie = true
        local pedHeading = GetEntityHeading(ped)
        local h = math.rad(pedHeading)
        local forward = vector3(-math.sin(h), math.cos(h), 0.0)
        local right = vector3(math.cos(h), math.sin(h), 0.0)
        local camPos = head + forward * 1.35 + right * 0.18 + vector3(0.0, 0.0, 0.06)
        SetCamCoord(scriptCamera, camPos.x, camPos.y, camPos.z)
        PointCamAtCoord(scriptCamera, head.x, head.y, head.z + 0.03)
    else
        cameraSelfie = false
        local forward = rotToForward(cameraHeading, cameraPitch)
        local camPos = head + forward * 0.42 + vector3(0.0, 0.0, 0.04)
        SetCamCoord(scriptCamera, camPos.x, camPos.y, camPos.z)
        SetCamRot(scriptCamera, cameraPitch, 0.0, cameraHeading, 2)
    end
end

local function startNativeCamera(data)
    nativeCameraActive = true
    nativeCameraFacing = (data and data.facing) or nativeCameraFacing or 'back'
    nativeCameraZoom = 1.0
    cameraHeading = GetGameplayCamRot(2).z
    cameraPitch = clamp(GetGameplayCamRot(2).x, -60.0, 60.0)

    playCameraAnim()
    pcall(function()
        loadAnim('cellphone@')
        TaskPlayAnim(PlayerPedId(), 'cellphone@', 'cellphone_photo_idle', 3.0, -1, -1, 50, 0, false, false, false)
    end)

    if scriptCamera then
        DestroyCam(scriptCamera, false)
        scriptCamera = nil
    end

    scriptCamera = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamFov(scriptCamera, 55.0)
    updateScriptCamera()
    RenderScriptCams(true, true, 250, true, true)
end

local function stopNativeCamera()
    if nativeCameraActive then
        nativeCameraActive = false
        if scriptCamera then
            RenderScriptCams(false, true, 250, true, true)
            DestroyCam(scriptCamera, false)
            scriptCamera = nil
        end
        pcall(function() CellFrontCamActivate(false) end)
        pcall(function() CellCamActivate(false, false) end)
        pcall(function() DestroyMobilePhone() end)
        if phoneOpen then
            playPhoneAnim('phone')
        end
    end
end

local function updateNativeCamera(data)
    if not nativeCameraActive then return end
    nativeCameraFacing = (data and data.facing) or nativeCameraFacing
    nativeCameraZoom = 1.0
    if nativeCameraFacing == 'front' then
        pcall(function()
            loadAnim('cellphone@self')
            TaskPlayAnim(PlayerPedId(), 'cellphone@self', 'selfie', 3.0, -1, -1, 50, 0, false, false, false)
        end)
    else
        pcall(function()
            loadAnim('cellphone@')
            TaskPlayAnim(PlayerPedId(), 'cellphone@', 'cellphone_photo_idle', 3.0, -1, -1, 50, 0, false, false, false)
        end)
    end
    updateScriptCamera()
end

local function openPhone()
    if phoneOpen then return end
    phoneOpen = true
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(true)
    typingInPhone = false
    createPhoneProp()
    playPhoneAnim('phone')
    SendNUIMessage({ action = 'open' })
    TriggerServerEvent('vib_phone:requestData')
    SendNUIMessage({ action = 'vehicleStatus', inVehicle = IsPedInAnyVehicle(PlayerPedId(), false) })
end

local function closePhone()
    if not phoneOpen then return end
    stopNativeCamera()
    phoneOpen = false
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    typingInPhone = false
    SendNUIMessage({ action = 'close' })
    if not inCall then
        stopPhoneAnim()
        deletePhoneProp()
    end
end

RegisterCommand(Config.Command, function()
    if phoneOpen then closePhone() else openPhone() end
end)

Citizen.CreateThread(function()
    while true do
        Citizen.Wait(0)
        if IsControlJustPressed(0, Config.OpenKey) then
            if phoneOpen then closePhone() else openPhone() end
        end
    end
end)

RegisterNUICallback('close', function(data, cb) closePhone(); cb('ok') end)
RegisterNUICallback('requestData', function(data, cb) TriggerServerEvent('vib_phone:requestData'); cb('ok') end)
RegisterNUICallback('saveContact', function(data, cb) TriggerServerEvent('vib_phone:saveContact', data); cb('ok') end)
RegisterNUICallback('addContact', function(data, cb) TriggerServerEvent('vib_phone:addContact', data.name, data.number); cb('ok') end)
RegisterNUICallback('deleteContact', function(data, cb) TriggerServerEvent('vib_phone:deleteContact', data.number); cb('ok') end)
RegisterNUICallback('sendMessage', function(data, cb) TriggerServerEvent('vib_phone:sendMessage', data.number, data.text); cb('ok') end)
RegisterNUICallback('readConversation', function(data, cb) TriggerServerEvent('vib_phone:readConversation', data.key); cb('ok') end)
RegisterNUICallback('tweet', function(data, cb) TriggerServerEvent('vib_phone:tweet', data.text); cb('ok') end)
RegisterNUICallback('twitterRegister', function(data, cb) TriggerServerEvent('vib_phone:twitterRegister', data); cb('ok') end)
RegisterNUICallback('twitterPost', function(data, cb) TriggerServerEvent('vib_phone:twitterPost', data); cb('ok') end)
RegisterNUICallback('twitterComment', function(data, cb) TriggerServerEvent('vib_phone:twitterComment', data); cb('ok') end)
RegisterNUICallback('twitterDeletePost', function(data, cb) TriggerServerEvent('vib_phone:twitterDeletePost', data.postId); cb('ok') end)
RegisterNUICallback('setWallpaper', function(data, cb) TriggerServerEvent('vib_phone:setWallpaper', data.index); cb('ok') end)
RegisterNUICallback('deletePhotos', function(data, cb) TriggerServerEvent('vib_phone:deletePhotos', data and data.ids or {}); cb('ok') end)
RegisterNUICallback('cameraEnter', function(data, cb) startNativeCamera(data); cb('ok') end)
RegisterNUICallback('cameraExit', function(data, cb) stopNativeCamera(); cb('ok') end)
RegisterNUICallback('cameraSetState', function(data, cb) updateNativeCamera(data); cb('ok') end)
RegisterNUICallback('cameraSaveCroppedPhoto', function(data, cb)
    local imageData = tostring((data and data.image) or '')
    if imageData ~= '' then
        TriggerServerEvent('vib_phone:savePhoto', imageData)
        Citizen.SetTimeout(350, function()
            if phoneOpen then TriggerServerEvent('vib_phone:requestData') end
        end)
    else
        SendNUIMessage({ action = 'toast', text = 'Kunne ikke gemme billedet.' })
    end
    cb('ok')
end)
RegisterNUICallback('cameraTakePhoto', function(data, cb)
    -- V48: screenshot-basic capture fra spillerens aktuelle kamera-view.
    -- Fail-safe så flere billeder kan tages efter hinanden uden at låse callback/busy state.
    if cameraCaptureBusy then
        cb('ok')
        return
    end
    cameraCaptureBusy = true

    local screenshotState = GetResourceState('screenshot-basic')
    if screenshotState ~= 'started' then
        cameraCaptureBusy = false
        SendNUIMessage({ action = 'toast', text = 'screenshot-basic er ikke startet.' })
        cb('ok')
        return
    end

    -- Skjul kun telefon/NUI under selve capturen, så billedet bliver spillerens kamera-view.
    SendNUIMessage({ action = 'cameraCaptureHide', hidden = true })

    Citizen.SetTimeout(160, function()
        local done = false
        local ok = pcall(function()
            exports['screenshot-basic']:requestScreenshot({
                encoding = 'jpg',
                quality = 0.92
            }, function(imageData)
                done = true
                cameraCaptureBusy = false
                SendNUIMessage({ action = 'cameraCaptureHide', hidden = false })

                if imageData and type(imageData) == 'string' and imageData ~= '' then
                    local createdAt = (GetCloudTimeAsInt and GetCloudTimeAsInt()) or math.floor(GetGameTimer()/1000)
                    -- V50: Send rå screenshot til NUI, hvor det beskæres til stående 9:16.
                    -- Serveren gemmer først billedet efter crop, så kamerarullen ikke får vandrette billeder.
                    SendNUIMessage({ action = 'cameraRawCaptured', image = imageData, created_at = createdAt })
                else
                    SendNUIMessage({ action = 'toast', text = 'Kunne ikke gemme billedet.' })
                end
            end)
        end)

        if not ok then
            cameraCaptureBusy = false
            SendNUIMessage({ action = 'cameraCaptureHide', hidden = false })
            SendNUIMessage({ action = 'toast', text = 'screenshot-basic kunne ikke tage billedet.' })
        end

        Citizen.SetTimeout(4500, function()
            if not done then
                cameraCaptureBusy = false
                SendNUIMessage({ action = 'cameraCaptureHide', hidden = false })
                SendNUIMessage({ action = 'toast', text = 'Kamera timeout - prøv igen.' })
            end
        end)
    end)

    cb('ok')
end)
RegisterNUICallback('deleteCallLog', function(data, cb) TriggerServerEvent('vib_phone:deleteCallLog', data.id); cb('ok') end)
RegisterNUICallback('startCall', function(data, cb) TriggerServerEvent('vib_phone:startCall', data.number); cb('ok') end)
RegisterNUICallback('answerCall', function(data, cb) TriggerServerEvent('vib_phone:answerCall', data.callId); cb('ok') end)
RegisterNUICallback('endCall', function(data, cb) TriggerServerEvent('vib_phone:endCall', data.callId or currentCall); cb('ok') end)
RegisterNUICallback('speaker', function(data, cb)
    speaker = data.enabled == true
    TriggerServerEvent('vib_phone:setSpeaker', data.callId or currentCall, speaker)
    playPhoneAnim(speaker and 'speaker' or 'call')
    cb('ok')
end)
RegisterNUICallback('mute', function(data, cb) cb('ok') end)
RegisterNUICallback('inputFocus', function(data, cb)
    typingInPhone = data and data.focused == true
    cb('ok')
end)

Citizen.CreateThread(function()
    while true do
        if phoneOpen then
            Citizen.Wait(0)

            local ped = PlayerPedId()
            -- Telefonen må ikke aktivere våben/hotbar/inventory. Spilleren må kun bevæge sig rundt.
            DisablePlayerFiring(PlayerId(), true)
            SetPedCanSwitchWeapon(ped, false)
            DisableControlAction(0, 24, true)   -- attack
            DisableControlAction(0, 25, true)   -- aim
            DisableControlAction(0, 37, true)   -- weapon wheel
            DisableControlAction(0, 45, true)   -- reload
            DisableControlAction(0, 69, true)   -- vehicle attack
            DisableControlAction(0, 70, true)   -- vehicle attack 2
            DisableControlAction(0, 92, true)   -- vehicle passenger attack
            DisableControlAction(0, 106, true)  -- vehicle mouse override
            DisableControlAction(0, 114, true)  -- fly attack
            DisableControlAction(0, 140, true)  -- melee
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            DisableControlAction(0, 143, true)
            DisableControlAction(0, 257, true)  -- attack 2
            DisableControlAction(0, 263, true)  -- melee attack 1
            DisableControlAction(0, 264, true)  -- melee attack 2

            -- Bloker alle GTA weapon slot controls i både normal og frontend input group.
            for _, control in ipairs({157,158,159,160,161,162,163,164,165}) do
                DisableControlAction(0, control, true)
                DisableControlAction(1, control, true)
                DisableControlAction(2, control, true)
            end

            -- Ekstra Devo/vRP hotbar/inventory/menu taster.
            for _, control in ipairs({12,13,14,15,16,17,44,56,57,81,82,83,84,85,156,166,167,168,169,170,199,200,243,244,289,311}) do
                DisableControlAction(0, control, true)
                DisableControlAction(2, control, true)
            end

            if nativeCameraActive then
                -- Kameraet styres med piletaster, så musen kan bruges på telefonens UI uden at flytte billedet.
                DisableControlAction(0, 1, true)
                DisableControlAction(0, 2, true)
                DisableControlAction(0, 3, true)
                DisableControlAction(0, 4, true)
                DisableControlAction(0, 5, true)
                DisableControlAction(0, 6, true)
                local speed = IsDisabledControlPressed(0, 21) and 2.4 or 1.25
                if nativeCameraFacing ~= 'front' then
                    if IsDisabledControlPressed(0, 174) then cameraHeading = cameraHeading + speed end
                    if IsDisabledControlPressed(0, 175) then cameraHeading = cameraHeading - speed end
                    if IsDisabledControlPressed(0, 172) then cameraPitch = clamp(cameraPitch + speed * 0.72, -65.0, 65.0) end
                    if IsDisabledControlPressed(0, 173) then cameraPitch = clamp(cameraPitch - speed * 0.72, -65.0, 65.0) end
                end
                updateScriptCamera()
            end

            if typingInPhone then
                -- Når man skriver i et inputfelt, må spillet slet ikke reagere på tastetryk.
                DisableAllControlActions(0)
                DisableAllControlActions(1)
                DisableAllControlActions(2)
                DisablePlayerFiring(PlayerId(), true)
                EnableControlAction(0, 322, true) -- ESC
                EnableControlAction(0, 200, true) -- pause/ESC
            else
                -- Spilleren må gå rundt. I kamera-appen skal mus/right stick kunne styre kameraet op/ned/side.
                if not nativeCameraActive then
                    DisableControlAction(0, 1, true)
                    DisableControlAction(0, 2, true)
                    DisableControlAction(0, 3, true)
                    DisableControlAction(0, 4, true)
                    DisableControlAction(0, 5, true)
                    DisableControlAction(0, 6, true)
                end
                DisableControlAction(0, 24, true)
                DisableControlAction(0, 25, true)
                DisableControlAction(0, 37, true)
                DisableControlAction(0, 44, true)
                DisableControlAction(0, 45, true)
                DisableControlAction(0, 140, true)
                DisableControlAction(0, 141, true)
                DisableControlAction(0, 142, true)
                DisableControlAction(0, 143, true)
                DisableControlAction(0, 22, true)
                DisableControlAction(0, 23, true)
                DisableControlAction(0, 38, true)
                DisableControlAction(0, 75, true)  -- exit vehicle

                -- Bloker inventory/hotbar/radio/menu-taster mens telefonen er åben.
                DisableControlAction(0, 12, true)
                DisableControlAction(0, 13, true)
                DisableControlAction(0, 14, true)
                DisableControlAction(0, 15, true)
                DisableControlAction(0, 16, true)
                DisableControlAction(0, 17, true)
                DisableControlAction(0, 81, true)
                DisableControlAction(0, 82, true)
                DisableControlAction(0, 83, true)
                DisableControlAction(0, 84, true)
                DisableControlAction(0, 85, true)
                DisableControlAction(0, 157, true) -- hotbar 1
                DisableControlAction(0, 158, true) -- hotbar 2
                DisableControlAction(0, 160, true) -- hotbar 3
                DisableControlAction(0, 164, true) -- hotbar 4
                DisableControlAction(0, 165, true) -- hotbar 5
                DisableControlAction(0, 170, true) -- F3/menu
                DisableControlAction(0, 199, true)
                DisableControlAction(0, 200, true)
                DisableControlAction(0, 244, true) -- M/radio/menu
                DisableControlAction(0, 289, true) -- F2/inventory på mange Devo/vRP servere
                DisableControlAction(0, 311, true) -- K/inventory på mange servere
                DisableControlAction(0, 19, true)  -- ALT
                DisableControlAction(0, 20, true)  -- Z/player list
                DisableControlAction(0, 21, true)  -- sprint modifier actions
                DisableControlAction(0, 56, true)  -- F9
                DisableControlAction(0, 57, true)  -- F10
                DisableControlAction(0, 156, true)
                DisableControlAction(0, 159, true)
                DisableControlAction(0, 161, true)
                DisableControlAction(0, 162, true)
                DisableControlAction(0, 163, true)
                DisableControlAction(0, 166, true) -- F5
                DisableControlAction(0, 167, true) -- F6
                DisableControlAction(0, 168, true) -- F7
                DisableControlAction(0, 169, true) -- F8
                DisableControlAction(0, 243, true) -- console/tilde
            end
        else
            SetPedCanSwitchWeapon(PlayerPedId(), true)
            Citizen.Wait(150)
        end
    end
end)



Citizen.CreateThread(function()
    local lastInVehicle = nil
    while true do
        if phoneOpen then
            local inVeh = IsPedInAnyVehicle(PlayerPedId(), false)
            if inVeh ~= lastInVehicle then
                lastInVehicle = inVeh
                SendNUIMessage({ action = 'vehicleStatus', inVehicle = inVeh })
            end
            Citizen.Wait(700)
        else
            lastInVehicle = nil
            Citizen.Wait(1000)
        end
    end
end)

RegisterNetEvent('vib_phone:receiveData')
AddEventHandler('vib_phone:receiveData', function(data)
    SendNUIMessage({ action = 'data', data = data })
    SendNUIMessage({ action = 'vehicleStatus', inVehicle = IsPedInAnyVehicle(PlayerPedId(), false) })
end)

RegisterNetEvent('vib_phone:updateTweets')
AddEventHandler('vib_phone:updateTweets', function(tweets)
    SendNUIMessage({ action = 'tweets', tweets = tweets })
end)

RegisterNetEvent('vib_phone:pushNotification')
AddEventHandler('vib_phone:pushNotification', function(payload)
    SendNUIMessage({ action = 'notification', payload = payload })
end)

RegisterNetEvent('vib_phone:toast')
AddEventHandler('vib_phone:toast', function(text)
    SendNUIMessage({ action = 'toast', text = text })
end)

RegisterNetEvent('vib_phone:incomingCall')
AddEventHandler('vib_phone:incomingCall', function(data)
    currentCall = data.callId
    createPhoneProp()
    SendNUIMessage({ action = 'incomingCall', data = data })
end)

RegisterNetEvent('vib_phone:outgoingCall')
AddEventHandler('vib_phone:outgoingCall', function(data)
    currentCall = data.callId
    inCall = false
    createPhoneProp()
    playPhoneAnim('call')
    SendNUIMessage({ action = 'outgoingCall', data = data })
end)

RegisterNetEvent('vib_phone:callActive')
AddEventHandler('vib_phone:callActive', function(data)
    currentCall = data.callId
    inCall = true
    createPhoneProp()
    playPhoneAnim('call')
    SendNUIMessage({ action = 'callActive', data = data })
end)

RegisterNetEvent('vib_phone:callFailed')
AddEventHandler('vib_phone:callFailed', function(reason)
    SendNUIMessage({ action = 'toast', text = reason })
    currentCall = nil
    inCall = false
    if not phoneOpen then deletePhoneProp(); stopPhoneAnim() end
end)

RegisterNetEvent('vib_phone:callEnded')
AddEventHandler('vib_phone:callEnded', function()
    currentCall = nil
    inCall = false
    speaker = false
    SendNUIMessage({ action = 'callEnded' })
    if not phoneOpen then deletePhoneProp(); stopPhoneAnim() else playPhoneAnim('phone') end
end)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        SetNuiFocus(false, false)
        SetNuiFocusKeepInput(false)
        deletePhoneProp()
        stopPhoneAnim()
    end
end)
