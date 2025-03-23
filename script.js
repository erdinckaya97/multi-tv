        // Default settings
        let currentLang = 'tr';
        let selectedCount = 6; // Default to 6 for the predefined channels
        
        // Default channel IDs provided by the user
        let defaultChannelIds = [
            "DbQ4HGgr7Xo",
            "VXMR3YQ7W3s",
            "RNVNlJSUFoE",
            "6BX-NUzBSp8",
            "ztmY_cCtUl0",
            "nmY9i63t6qo"
        ];
        
        let channelIds = Array(25).fill('');
        // Fill with default channels
        defaultChannelIds.forEach((id, index) => {
            channelIds[index] = id;
        });
        
        let activeChannels = [];
        let autoStart = true;

        // DOM elements
        const settingsPage = document.getElementById('settings-page');
        const playerPage = document.getElementById('player-page');
        const channelInputs = document.getElementById('channel-inputs');
        const playerChannelInputs = document.getElementById('player-channel-inputs');
        const videoContainer = document.getElementById('video-container');
        const countOptions = document.querySelectorAll('.count-option');
        const languageOptions = document.querySelectorAll('.language-option');
        const channelEditor = document.getElementById('channel-editor');
        const autoStartCheckbox = document.getElementById('auto-start');
        
        // Translations
        const translations = {
            tr: {
                backToSettings: "Ayarlara Dön",
                editChannels: "Kanalları Düzenle",
                applyChanges: "Değişiklikleri Uygula",
                channelEditing: "Kanal Düzenleme",
                addChannel: "Yeni kanal ekle",
                removeSelected: "Seçili Kanalları Kaldır",
                channelPlaceholder: "Kanal ID",
                maxChannelsReached: "Maksimum kanal sayısına ulaştınız!",
                enterAtLeastOne: "En az bir kanal ID'si girmelisiniz!",
                autoPlay: "Sayfa açılışında kanalları otomatik oynat"
            },
            en: {
                backToSettings: "Back to Settings",
                editChannels: "Edit Channels",
                applyChanges: "Apply Changes",
                channelEditing: "Channel Editing",
                addChannel: "Add New Channel",
                removeSelected: "Remove Selected Channels",
                channelPlaceholder: "Channel ID",
                maxChannelsReached: "Maximum number of channels reached!",
                enterAtLeastOne: "You must enter at least one channel ID!",
                autoPlay: "Auto-play channels on page load"
            }
            // Add other languages as needed
        };
        
        // Auto-start checkbox event listener
        autoStartCheckbox.addEventListener('change', function() {
            autoStart = this.checked;
        });
        
        // Set active channel count
        countOptions.forEach(option => {
            option.addEventListener('click', function() {
                countOptions.forEach(opt => opt.classList.remove('active'));
                this.classList.add('active');
                selectedCount = parseInt(this.getAttribute('data-count'));
                generateChannelInputs();
            });
            
            if(parseInt(option.getAttribute('data-count')) === selectedCount) {
                option.classList.add('active');
            }
        });
        
        // Language selection
        languageOptions.forEach(option => {
            option.addEventListener('click', function() {
                currentLang = this.getAttribute('data-lang');
                // Here you would implement language switching logic
                updateUIText();
                alert('Dil değiştirildi: ' + currentLang);
            });
        });
        
        // Update UI text based on selected language
        function updateUIText() {
            const lang = translations[currentLang] || translations.tr;
            
            document.getElementById('back-to-settings').textContent = lang.backToSettings;
            document.getElementById('toggle-channel-editor').textContent = lang.editChannels;
            document.getElementById('apply-changes').textContent = lang.applyChanges;
            document.querySelector('.channel-editor-title').textContent = lang.channelEditing;
            document.getElementById('player-add-channel').textContent = lang.addChannel;
            document.getElementById('remove-channels').textContent = lang.removeSelected;
            document.querySelector('label[for="auto-start"]').textContent = lang.autoPlay;
        }
        
        // Generate channel input fields for settings page
        function generateChannelInputs() {
            channelInputs.innerHTML = '';
            
            for(let i = 0; i < selectedCount; i++) {
                const div = document.createElement('div');
                div.className = 'channel-input';
                
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = `Kanal ${i+1} ID`;
                input.value = channelIds[i] || '';
                input.setAttribute('data-index', i);
                
                input.addEventListener('change', function() {
                    channelIds[parseInt(this.getAttribute('data-index'))] = this.value;
                });
                
                const removeBtn = document.createElement('button');
                removeBtn.textContent = 'X';
                removeBtn.addEventListener('click', function() {
                    // Remove this channel
                    const index = parseInt(input.getAttribute('data-index'));
                    channelIds[index] = '';
                    
                    // Shift all channels up
                    for(let j = index; j < channelIds.length - 1; j++) {
                        channelIds[j] = channelIds[j + 1];
                    }
                    channelIds[channelIds.length - 1] = '';
                    
                    generateChannelInputs();
                });
                
                div.appendChild(input);
                div.appendChild(removeBtn);
                channelInputs.appendChild(div);
            }
        }
        
        // Generate channel input fields for player page
        function generatePlayerChannelInputs() {
            playerChannelInputs.innerHTML = '';
            
            activeChannels.forEach((channel, index) => {
                const div = document.createElement('div');
                div.className = 'channel-input';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'channel-checkbox';
                
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = `Kanal ${index+1} ID`;
                input.value = channel.id || '';
                input.setAttribute('data-index', index);
                
                input.addEventListener('change', function() {
                    activeChannels[index].id = this.value;
                });
                
                div.appendChild(checkbox);
                div.appendChild(input);
                playerChannelInputs.appendChild(div);
            });
            
            // Add empty slots for new channels
            for(let i = activeChannels.length; i < 25; i++) {
                const div = document.createElement('div');
                div.className = 'channel-input';
                
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = `Yeni Kanal ID`;
                input.setAttribute('data-index', i);
                
                input.addEventListener('change', function() {
                    if(this.value.trim() !== '') {
                        // Add new channel
                        const newChannel = { id: this.value.trim() };
                        activeChannels.push(newChannel);
                        generatePlayerChannelInputs();
                    }
                });
                
                div.appendChild(input);
                playerChannelInputs.appendChild(div);
                
                // Only add one empty slot
                break;
            }
        }
        
        // Add new channel in settings
        document.getElementById('add-channel').addEventListener('click', function() {
            if(selectedCount < 25) {
                selectedCount++;
                countOptions.forEach(opt => {
                    if(parseInt(opt.getAttribute('data-count')) === selectedCount) {
                        opt.classList.add('active');
                    } else {
                        opt.classList.remove('active');
                    }
                });
                generateChannelInputs();
            } else {
                alert('Maksimum kanal sayısına ulaştınız!');
            }
        });
        
        // Add new channel in player
        document.getElementById('player-add-channel').addEventListener('click', function() {
            if(activeChannels.length < 25) {
                activeChannels.push({ id: '' });
                generatePlayerChannelInputs();
            } else {
                alert('Maksimum kanal sayısına ulaştınız!');
            }
        });
        
        // Remove selected channels
        document.getElementById('remove-channels').addEventListener('click', function() {
            const checkboxes = document.querySelectorAll('.channel-checkbox:checked');
            
            if(checkboxes.length === 0) {
                return;
            }
            
            const indicesToRemove = [];
            checkboxes.forEach(checkbox => {
                const input = checkbox.nextElementSibling;
                const index = parseInt(input.getAttribute('data-index'));
                indicesToRemove.push(index);
            });
            
            // Sort indices in descending order to remove from end first
            indicesToRemove.sort((a, b) => b - a);
            
            indicesToRemove.forEach(index => {
                activeChannels.splice(index, 1);
            });
            
            generatePlayerChannelInputs();
        });
        
        // Toggle channel editor
        document.getElementById('toggle-channel-editor').addEventListener('click', function() {
            channelEditor.classList.toggle('hidden');
            if(!channelEditor.classList.contains('hidden')) {
                generatePlayerChannelInputs();
            }
        });
        
        // Apply changes button
        document.getElementById('apply-changes').addEventListener('click', function() {
            if(activeChannels.length === 0) {
                alert('En az bir kanal ID\'si girmelisiniz!');
                return;
            }
            
            renderVideoGrid();
        });
        
        // Render the video grid
        function renderVideoGrid() {
            const validChannels = activeChannels.filter(channel => channel.id && channel.id.trim() !== '');
            
            if(validChannels.length === 0) {
                return;
            }
            
            // Calculate grid dimensions
            const columns = Math.ceil(Math.sqrt(validChannels.length));
            
            videoContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
            videoContainer.innerHTML = '';
            
            validChannels.forEach((channel, index) => {
                const videoId = channel.id.trim();
                
                const videoContainer = document.createElement('div');
                videoContainer.className = 'video-container';
                videoContainer.style.aspectRatio = '16/9';
                
                const iframe = document.createElement('iframe');
                iframe.width = '100%';
                iframe.height = '100%';
                iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=${autoStart ? 1 : 0}&mute=1`;
                iframe.frameBorder = '0';
                iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
                iframe.allowFullscreen = true;
                
                const overlay = document.createElement('div');
                overlay.className = 'video-overlay';
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn btn-danger';
                removeBtn.textContent = 'Kaldır';
                removeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    activeChannels.splice(index, 1);
                    renderVideoGrid();
                });
                
                overlay.appendChild(removeBtn);
                videoContainer.appendChild(iframe);
                videoContainer.appendChild(overlay);
                
                document.getElementById('video-container').appendChild(videoContainer);
            });
            
            // Hide the channel editor after applying changes
            channelEditor.classList.add('hidden');
        }
        
        // Save settings and load player
        document.getElementById('save-settings').addEventListener('click', function() {
            // Validate inputs
            const validChannelIds = channelIds.filter(id => id && id.trim() !== '');
            
            if(validChannelIds.length === 0) {
                alert('En az bir kanal ID\'si girmelisiniz!');
                return;
            }
            
            // Create active channels array from valid channel IDs
            activeChannels = validChannelIds.map(id => ({ id }));
            
            // Render the video grid
            renderVideoGrid();
            
            // Switch to player page
            settingsPage.classList.add('hidden');
            playerPage.classList.remove('hidden');
            
            // Update UI text based on language
            updateUIText();
        });
        
        // Back to settings
        document.getElementById('back-to-settings').addEventListener('click', function() {
            playerPage.classList.add('hidden');
            settingsPage.classList.remove('hidden');
            
            // Update channel IDs with active channels
            channelIds = Array(25).fill('');
            activeChannels.forEach((channel, index) => {
                if(index < 25) {
                    channelIds[index] = channel.id;
                }
            });
            
            // Update selected count to match active channels
            selectedCount = Math.min(Math.max(activeChannels.length, 4), 25);
            
            countOptions.forEach(opt => {
                if(parseInt(opt.getAttribute('data-count')) === selectedCount) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
            
            generateChannelInputs();
        });
        
        // Initialize the app
        generateChannelInputs();
        
        // Start automatically if we have default channels
        if (defaultChannelIds.length > 0 && autoStart) {
            // Create active channels from default channel IDs
            activeChannels = defaultChannelIds.map(id => ({ id }));
            
            // Immediately switch to player page and render videos
            window.addEventListener('load', function() {
                setTimeout(function() {
                    renderVideoGrid();
                    settingsPage.classList.add('hidden');
                    playerPage.classList.remove('hidden');
                    updateUIText();
                }, 100); // Small delay to ensure the page is fully loaded
            });
        }
        
        // Load from localStorage if available
        window.addEventListener('load', function() {
            const savedSettings = localStorage.getItem('multiTvSettings');
            if(savedSettings) {
                const settings = JSON.parse(savedSettings);
                currentLang = settings.lang || 'tr';
                selectedCount = settings.count || selectedCount;
                
                // Only load saved channels if there are no default channels
                if (defaultChannelIds.length === 0) {
                    channelIds = settings.channels || Array(25).fill('');
                }
                
                // Load autoStart setting
                if (settings.autoStart !== undefined) {
                    autoStart = settings.autoStart;
                    autoStartCheckbox.checked = autoStart;
                }
                
                countOptions.forEach(opt => {
                    if(parseInt(opt.getAttribute('data-count')) === selectedCount) {
                        opt.classList.add('active');
                    } else {
                        opt.classList.remove('active');
                    }
                });
                
                generateChannelInputs();
            }
        });
        
        // Save to localStorage when settings change
        window.addEventListener('beforeunload', function() {
            const settings = {
                lang: currentLang,
                count: selectedCount,
                channels: channelIds,
                autoStart: autoStart
            };
            
            localStorage.setItem('multiTvSettings', JSON.stringify(settings));
        });
