// ==UserScript==
// @name         Torn - Bazaar Pricer
// @namespace    https://github.com/danielgoodwin97/torn-bazaar-pricer
// @version      1.5.6
// @description  Automatically price & add quantity to bazaar items.
// @author       FATU [1482556]
// @match        *.torn.com/bazaar.php*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @resource     styles https://github.com/danielgoodwin97/torn-bazaar-pricer/raw/master/css/styles.css
// @updateURL    https://github.com/danielgoodwin97/torn-bazaar-pricer/raw/master/auto-bazaar-pricer.user.js
// @downloadURL  https://github.com/danielgoodwin97/torn-bazaar-pricer/raw/master/auto-bazaar-pricer.user.js
// @supportURL   https://www.torn.com/messages.php#/p=compose&XID=1482556
// ==/UserScript==

$(() => {
    'use strict';

    // Add stylesheet.
    GM_addStyle(GM_getResourceText('styles'));

    // Keys & defaults for script.
    var storage = 'auto-pricer',
        defaults = {
            key: {
                value: null,
                label: 'API Key',
                type: 'text'
            },
            interval: {
                value: 1000,
                label: 'Interval between API calls',
                type: 'number'
            },
            setPrices: {
                value: true,
                label: 'Automatically price items?',
                type: 'checkbox'
            },
            setQuantities: {
                value: false,
                label: 'Automatically set quantity of items?',
                type: 'checkbox'
            },
            amountBelowMarket: {
                value: 1,
                label: 'Amount below market value',
                type: 'number'
            }
        },
        options = GM_getValue(storage) || defaults;

    // Auto-pricer object.
    let pricer = {
        currentTab: null,

        // Current items.
        items: {},

        /**
         * Full page loader.
         */
        loader: {
            elements: {
                image: null,
                message: null
            },

            /**
             * Create loader element and add to page.
             */
            build: function () {
                const wrapper = $('<div class="loader-wrap"></div>'),
                    loader = $('<img src="https://i.imgur.com/u3DrfHr.gif" />'),
                    message = $('<div class="loader-message"></div>');

                // Add loader to document.
                $('body').append(wrapper);

                // Add loader elements to wrapper and hide.
                wrapper.append(loader).append(message).hide();

                // Set elements in loader object.
                this.elements.image = wrapper;
                this.elements.message = message;

                return this;
            },

            /**
             * Update loader message.
             * @param text {string} | Message to display.
             */
            update: function (text) {
                this.elements.message.text(text);

                return this;
            },

            /**
             * Show loader.
             * @returns {pricer}
             */
            show: function () {
                const {image, message} = this.elements;

                image.show();
                message.show();

                return this;
            },

            /**
             * Hide loader.
             * @returns {pricer}
             */
            hide: function () {
                const {image, message} = this.elements;

                image.hide();
                message.hide();

                return this;
            }
        },

        /**
         * Button to trigger scrape start.
         */
        buttons: {
            elements: {
                start: null,
                configure: null
            },

            /**
             * Create element and add to page.
             */
            build: function () {
                const buttons = [
                    $('<a class="linkContainer___47uQr inRow___J1Bmd greyLineV___HQIEI auto-pricer-configure">Configure</a>'),
                    $('<a class="linkContainer___47uQr inRow___J1Bmd greyLineV___HQIEI auto-pricer-start">Start FATU\'s Pricer</a>')
                ];

                $('.linksContainer___2Kgsm').prepend(buttons);

                this.elements = {
                    start: buttons[1],
                    configure: buttons[0]
                };

                this.setupListeners();
            },

            /**
             * Set up button event listener.
             */
            setupListeners: function () {
                const {start, configure} = this.elements;

                start.on('click', function () {
                    pricer.gatherItems();
                });

                configure.on('click', function () {
                    pricer.popup.show();
                });
            }
        },

        /**
         * Configuration popup.
         */
        popup: {
            elements: {
                popup: null,
                background: null
            },

            /**
             * All configuration option inputs.
             */
            inputs: _.mapValues(options, function (item, key) {
                var {value, label, type} = item,
                    hasValue = !!value;

                return $(`<label>${label} <input name="${key}" type="${type}" value="${hasValue ? value : ''}" ${hasValue ? 'checked' : ''} /></label>`);
            }),

            /**
             * Create element and add to page.
             * @returns {pricer}
             */
            build: function () {
                const popup = $('<div class="settings-popup"></div>'),
                    background = $('<div class="settings-popup-background"></div>');

                // Update configuration if there is inconsistencies between defaults & stored configuration.
                if (this.shouldUpdateConfiguration()) {
                    this.updateConfiguration(this.setDefaults());
                }

                for (let input in this.inputs) {
                    const currentInput = this.inputs[input];

                    // Add input to popup.
                    popup.append(currentInput);

                    // Set up listener for local storage options.
                    this.setupInputListener(input, currentInput);
                }

                // Add popup & background to document.
                $('body').append(popup).append(background);

                // Set elements in elements object.
                this.elements.popup = popup;
                this.elements.background = background;

                // Set up dismiss popup listeners.
                this.setupDismissListener();

                return this;
            },


            /**
             * Check if configuration needs updating.
             * @returns {boolean}
             */
            shouldUpdateConfiguration: function () {
                return !!_.difference(_.keys(defaults), _.keys(options)).length;
            },

            /**
             * Get configuration and add defaults if not set.
             * @returns {*}
             */
            setDefaults: function () {
                return _.defaults(options, defaults);
            },

            /**
             * Update configuration in storage.
             * @param value
             */
            updateConfiguration: function (value) {
                const updatedConfiguration = _.merge(options, value);

                // Update local options.
                options = updatedConfiguration;

                // Update storage options.
                GM_setValue(storage, updatedConfiguration);
            },

            /**
             * Set up dismiss listeners for popup.
             */
            setupDismissListener: function () {
                const self = this;

                this.elements.background.on('click', function () {
                    self.hide();
                });
            },

            /**
             * Set up listeners for updating configuration options in storage.
             * @param inputKey {string} | Storage key for configuration option.
             * @param input {object} | Input element.
             */
            setupInputListener: function (inputKey, input) {
                const self = this,
                    inputElement = input.find('input');

                inputElement.on('change', function () {
                    const currentInput = $(this),
                        inputType = currentInput.attr('type'),
                        isCheckbox = inputType === 'checkbox';

                    self.updateConfiguration({
                        [inputKey]: {
                            value: isCheckbox ? currentInput.prop('checked') : currentInput.val()
                        }
                    });
                });
            },

            /**
             * Show popup.
             */
            show: function () {
                this.elements.popup.show();
                this.elements.background.show();
            },

            /**
             * Hide popup.
             */
            hide: function () {
                this.elements.popup.hide();
                this.elements.background.hide();
            }
        },

        /**
         * Update current tab.
         */
        getCurrentTab: function () {
            const currentTab = $('.ui-tabs-nav').find('.ui-state-active'),
                currentTabName = currentTab.find('a').attr('href').replace('#', '');

            pricer.currentTab = currentTabName !== 'All' ? currentTabName : null;
        },

        /**
         * Grab all user items from API.
         */
        gatherItems: function () {
            const self = this,
                {currentTab} = self;

            // Show configuration popup when there's no API key.
            if (!options.key.value) {
                self.popup.show();

                return false;
            }

            $.ajax({
                url: 'https://api.torn.com/user',

                data: {
                    selections: 'inventory',
                    key: options.key.value
                },

                /**
                 * Show loader and update text before AJAX fires.
                 */
                beforeSend: function () {
                    self.loader.show().update('Preparing to gather all user items.');
                },

                /**
                 * Set up item in items object when scraped.
                 * @param data {object} | Torn API response.
                 */
                success: function (data) {
                    const {inventory} = data;

                    // Loop over all items in players inventory.
                    inventory.forEach(function (value) {
                        const {name, ID, type, quantity, market_price, equipped} = value,
                            isMarketable = !!market_price,
                            isEquipped = !!equipped,
                            isInCurrentTab = currentTab ? type === currentTab : true;

                        // Only add item if it's tradeable.
                        if (isMarketable && !isEquipped && isInCurrentTab) {
                            self.items[ID] = {
                                name: name,
                                quantity: quantity
                            }
                        }
                    });
                },

                /**
                 * Gather prices every selected interval (to not get API banned).
                 */
                complete: function () {
                    let i = 0;

                    // If there are no items, stop script.
                    if ($.isEmptyObject(self.items)) {
                        self.loader.hide();
                        console.log('No items were scraped. Please try again.');
                    }

                    self.loader.update('All items gathered.');

                    for (let id in pricer.items) {
                        setTimeout(function () {
                            self.getPrice(pricer.items[id].name, id);
                        }, options.interval.value * i);

                        i++;
                    }
                },

                /**
                 * If anything went wrong, hide the loader.
                 */
                error: function () {
                    self.loader.hide();
                    console.log('There was an error. Please try again.');
                }
            });
        },

        /**
         * Get cheapest possible price of a given item.
         * @param name {string} | Item name.
         * @param id {number} | Item ID.
         */
        getPrice: function (name, id) {
            const self = this;

            $.ajax({
                url: 'https://api.torn.com/market/' + id,

                data: {
                    selections: 'bazaar,itemmarket',
                    key: options.key.value
                },

                /**
                 * Update loader message with current item being scraped.
                 */
                beforeSend: function () {
                    self.loader.update('Scraping ' + name + '.');
                },

                /**
                 * Add listing price to items object.
                 * @param data {object} | Torn API response.
                 */
                success: function (data) {
                    const {bazaar, itemmarket} = data,
                        lowestPrices = [bazaar[0].cost, itemmarket[0].cost],
                        cheapest = Math.min(...lowestPrices);

                    // Set price to sell as a dollar lower.
                    self.items[id].price = cheapest - options.amountBelowMarket.value;
                },

                /**
                 * When all pricing is finished, hide the loader and add final prices to inputs.
                 */
                complete: function () {
                    if (self.isFinished()) {
                        self.loader.hide();
                        self.applyPricesAndQuantities();
                    }
                }
            });
        },

        /**
         * Grab price inputs for inventory items.
         * @param name {string} | Item name.
         * @param id {number} | Item ID.
         */
        getInputs: function (name, id) {
            const self = this,
                item = $('.items-cont li:visible');

            // Rather than using IDs we now have to use item names due to the image canvas update which removed
            // the ability to grab IDs from the URLs.
            item.each(function () {
                const currentItem = $(this),
                    itemName = currentItem.find('.name-wrap .t-overflow').text();

                // Add inputs to item object.
                if (name === itemName) {
                    self.items[id].inputs = {
                        price: currentItem.find('input[type="text"].input-money'),
                        quantity: currentItem.find('.amount input')
                    };
                }
            });
        },

        /**
         * Check whether item scraping has finished.
         * @returns {boolean}
         */
        isFinished: function () {
            const items = this.items,
                lastItem = items[Object.keys(items)[Object.keys(items).length - 1]];

            return !!lastItem.price;
        },

        /**
         * Apply prices to price fields.
         */
        applyPricesAndQuantities: function () {
            for (let item in this.items) {
                this.getInputs(this.items[item].name, item);

                const {price, quantity, inputs} = this.items[item],
                    {setPrices, setQuantities} = options;

                // If prices are set to be automatically added.
                if (setPrices.value) {
                    inputs.price.val(price);
                    inputs.price.trigger('keyup');
                }

                // If quantities are set to be automatically added.
                if (setQuantities.value) {
                    inputs.quantity.val(quantity);

                    if (inputs.quantity.attr('type') === 'checkbox') {
                        inputs.quantity.next('a').click();
                    }

                    // Cannot trigger this event with jquery for some reason?
                    // Has to be done in vanilla JS.
                    const event = new Event('input', {
                        bubbles: true,
                        cancelable: true,
                    });

                    // Trigger update event.
                    inputs.quantity[0].dispatchEvent(event);
                }
            }
        }
    };

    // Update current tab.
    $(document).on('click', '.ui-tabs-nav li', function () {
        const {getCurrentTab} = pricer;

        setTimeout(function () {
            pricer.items = {};
            getCurrentTab();
        }, 100);
    });

    // Run script.
    $(window).on('hashchange load', function () {
        const isAddPage = window.location.hash === '#/p=add' || window.location.hash === '#/add',
            {loader, popup, buttons, getCurrentTab} = pricer;

        // Create all auto pricer elements & update current tab.
        if (isAddPage) {
            setTimeout(function () {
                getCurrentTab();
                loader.build();
                popup.build();
                buttons.build();
            }, 500);
        }
    });
});
