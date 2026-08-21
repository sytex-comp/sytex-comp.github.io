(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.NotBoringReceipt = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    var EMPTY_VALUE = "--";

    var FIELD_DEFINITIONS = {
        itemTitle: {
            selector: ".item-title",
            aliases: ["itemTitle", "item-title", "item_title", "title", "name"]
        },
        itemDescription: {
            selector: ".item-description",
            aliases: ["itemDescription", "item-description", "item_description", "description"]
        },
        itemPrice: {
            selector: ".item-price",
            aliases: ["itemPrice", "item-price", "item_price", "subtotal", "amount"]
        },
        priceTax: {
            selector: ".price-tax",
            aliases: ["priceTax", "price-tax", "price_tax", "tax"]
        },
        discount: {
            selector: ".discount",
            aliases: ["discount", "discountAmount", "discount-amount", "discount_amount"]
        },
        priceTotal: {
            selector: ".price-total",
            aliases: ["priceTotal", "price-total", "price_total", "total", "totalPaid"]
        },
        orderId: {
            selector: ".order-id",
            aliases: ["orderId", "order-id", "order_id", "id", "transactionId", "transaction_id"]
        },
        paymentMethod: {
            selector: ".payment-method",
            aliases: ["paymentMethod", "payment-method", "payment_method", "payment", "paidWith", "card"]
        },
        purchaseDate: {
            selector: ".purchase-date",
            aliases: ["purchaseDate", "purchase-date", "purchase_date", "date", "createdAt", "created_at"]
        }
    };

    var CODE_128_PATTERNS = [
        "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
        "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
        "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
        "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
        "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
        "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
        "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
        "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
        "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
        "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
        "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
        "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
        "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
        "211214", "211232", "2331112"
    ];

    function toArray(list) {
        return Array.prototype.slice.call(list || []);
    }

    function normalizeValue(value) {
        if (value === undefined || value === null) {
            return EMPTY_VALUE;
        }

        var normalized = String(value).replace(/\s+/g, " ").trim();
        return normalized === "" ? EMPTY_VALUE : normalized;
    }

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function pickValue(data, aliases) {
        var index;
        var key;

        if (!data) {
            return EMPTY_VALUE;
        }

        for (index = 0; index < aliases.length; index += 1) {
            key = aliases[index];

            if (hasOwn(data, key)) {
                return normalizeValue(data[key]);
            }
        }

        return EMPTY_VALUE;
    }

    function getPath(object, path) {
        var parts = path.split(".");
        var current = object;
        var index;

        for (index = 0; index < parts.length; index += 1) {
            if (current === undefined || current === null) {
                return undefined;
            }

            current = current[parts[index]];
        }

        return current;
    }

    function firstPath(object, paths) {
        var index;
        var value;

        for (index = 0; index < paths.length; index += 1) {
            value = getPath(object, paths[index]);

            if (value !== undefined && value !== null && String(value).trim() !== "") {
                return value;
            }
        }

        return undefined;
    }

    function parseMoney(value) {
        var text = normalizeValue(value);
        var cleaned;
        var amount;
        var separators;
        var decimalPart;
        var prefixMatch;
        var suffixMatch;

        if (text === EMPTY_VALUE) {
            return null;
        }

        cleaned = text.replace(/\((.*)\)/, "-$1").replace(/[^0-9,.-]/g, "");
        separators = cleaned.match(/[.,](?=\d{1,4}\D*$)/);

        if (separators) {
            decimalPart = cleaned.slice(separators.index + 1).replace(/\D/g, "");
            cleaned = cleaned.slice(0, separators.index).replace(/\D/g, "") + "." + decimalPart;
        } else {
            cleaned = cleaned.replace(/[^0-9.-]/g, "");
        }

        if (/^-/.test(text) && cleaned.charAt(0) !== "-") {
            cleaned = "-" + cleaned;
        }

        amount = Number(cleaned);

        if (!isFinite(amount)) {
            return null;
        }

        prefixMatch = text.match(/^\s*([^0-9(+-\s]+)/);
        suffixMatch = text.match(/([^0-9)\s]+)\s*$/);

        return {
            amount: amount,
            decimals: decimalPart ? Math.min(decimalPart.length, 4) : 2,
            prefix: prefixMatch ? prefixMatch[1] : "",
            suffix: !prefixMatch && suffixMatch ? suffixMatch[1] : ""
        };
    }

    function formatMoney(amount, template) {
        var precision = template && typeof template.decimals === "number" ? template.decimals : 2;
        var absolute = Math.abs(amount).toFixed(precision);
        var sign = amount < 0 ? "-" : "";
        var prefix = template && template.prefix ? template.prefix : "";
        var suffix = template && template.suffix ? template.suffix : "";

        return sign + prefix + absolute + suffix;
    }

    function formatProviderMoney(value, currency) {
        var numberValue;

        if (value === undefined || value === null || value === "") {
            return EMPTY_VALUE;
        }

        if (typeof value === "string" && /[^\d.,-]/.test(value)) {
            return value;
        }

        numberValue = Number(value);

        if (!isFinite(numberValue)) {
            return normalizeValue(value);
        }

        if (Math.abs(numberValue) >= 100 && Math.round(numberValue) === numberValue) {
            numberValue = numberValue / 100;
        }

        try {
            return new Intl.NumberFormat("en", {
                currency: currency || "USD",
                style: "currency"
            }).format(numberValue);
        } catch (error) {
            return numberValue.toFixed(2);
        }
    }

    function formatProviderDate(value) {
        var date;

        if (!value) {
            return EMPTY_VALUE;
        }

        date = new Date(value);

        if (isNaN(date.getTime())) {
            return normalizeValue(value);
        }

        return date.toLocaleString("en", {
            day: "2-digit",
            hour: "2-digit",
            hour12: false,
            minute: "2-digit",
            month: "short"
        }).toUpperCase().replace(",", " \u2022");
    }

    function normalizeDiscount(value) {
        var normalized = normalizeValue(value);
        var parsed = parseMoney(normalized);
        var template;

        if (normalized === EMPTY_VALUE || !parsed || parsed.amount === 0) {
            return normalized;
        }

        if (/^-/.test(normalized) || /^\s*\(/.test(normalized)) {
            return normalized;
        }

        template = {
            decimals: parsed.decimals,
            prefix: parsed.prefix,
            suffix: parsed.suffix
        };

        return formatMoney(-Math.abs(parsed.amount), template);
    }

    function discountIsVisible(value) {
        var normalized = normalizeValue(value);
        var parsed = parseMoney(normalized);

        if (normalized === EMPTY_VALUE) {
            return false;
        }

        if (parsed) {
            return parsed.amount !== 0;
        }

        return true;
    }

    function calculateTotal(receipt) {
        var itemPrice = parseMoney(receipt.itemPrice);
        var tax = parseMoney(receipt.priceTax);
        var discount = parseMoney(receipt.discount);
        var template;
        var total;

        if (receipt.priceTotal !== EMPTY_VALUE || !itemPrice) {
            return receipt.priceTotal;
        }

        template = {
            decimals: itemPrice.decimals,
            prefix: itemPrice.prefix,
            suffix: itemPrice.suffix
        };

        total = itemPrice.amount;

        if (tax) {
            total += tax.amount;
        }

        if (discount) {
            total -= Math.abs(discount.amount);
        }

        return formatMoney(total, template);
    }

    function formatCardBrand(value) {
        var normalized = normalizeValue(value);
        var words;

        if (normalized === EMPTY_VALUE) {
            return EMPTY_VALUE;
        }

        words = normalized.replace(/[_-]+/g, " ").split(" ");

        return words.map(function (word) {
            if (word.toLowerCase() === "jcb") {
                return "JCB";
            }

            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(" ");
    }

    function derivePaymentMethod(data) {
        var brand = pickValue(data, [
            "cardBrand",
            "card-brand",
            "card_brand",
            "paymentBrand",
            "payment_brand",
            "brand"
        ]);
        var last4 = pickValue(data, [
            "cardLast4",
            "card-last4",
            "card_last4",
            "last4",
            "lastFour",
            "last_four",
            "paymentLast4",
            "payment_last4"
        ]);

        if (brand === EMPTY_VALUE || last4 === EMPTY_VALUE) {
            return EMPTY_VALUE;
        }

        return formatCardBrand(brand) + " \u2022\u2022\u2022\u2022 " + last4;
    }

    function normalize(data) {
        var receipt = {};
        var key;

        data = data || {};

        for (key in FIELD_DEFINITIONS) {
            if (hasOwn(FIELD_DEFINITIONS, key)) {
                receipt[key] = pickValue(data, FIELD_DEFINITIONS[key].aliases);
            }
        }

        if (receipt.paymentMethod === EMPTY_VALUE) {
            receipt.paymentMethod = derivePaymentMethod(data);
        }

        receipt.discount = normalizeDiscount(receipt.discount);
        receipt.priceTotal = calculateTotal(receipt);
        receipt.hasDiscount = discountIsVisible(receipt.discount);

        return receipt;
    }

    function unwrapProviderPayload(payload) {
        return payload && (payload.receipt || payload.transaction || payload.order || payload.data || payload);
    }

    function currencyFromProvider(payload) {
        return firstPath(payload, [
            "currencyCode",
            "currency_code",
            "currency",
            "details.totals.currency_code",
            "details.line_items.0.price.unit_price.currency_code",
            "items.0.price.unit_price.currency_code"
        ]) || "USD";
    }

    function cardBrandFromProvider(payload) {
        return firstPath(payload, [
            "cardBrand",
            "card_brand",
            "payment.method_details.card.type",
            "payment.method_details.card.brand",
            "payment.card.brand",
            "payments.0.card.type",
            "payments.0.card.brand",
            "payments.0.method_details.card.type",
            "payments.0.method_details.card.brand",
            "details.payments.0.card.type",
            "details.payments.0.card.brand",
            "details.payments.0.method_details.card.type",
            "details.payments.0.method_details.card.brand"
        ]);
    }

    function cardLast4FromProvider(payload) {
        return firstPath(payload, [
            "cardLast4",
            "card_last4",
            "last4",
            "last_four",
            "payment.method_details.card.last4",
            "payment.card.last4",
            "payments.0.card.last4",
            "payments.0.method_details.card.last4",
            "details.payments.0.card.last4",
            "details.payments.0.method_details.card.last4"
        ]);
    }

    function fromProviderPayload(payload, options) {
        var source = unwrapProviderPayload(payload) || {};
        var currency = currencyFromProvider(source);
        var fallbackOrderId = options && options.orderId;
        var lineItem = getPath(source, "details.line_items.0") || getPath(source, "items.0") || {};

        return normalize({
            itemTitle: firstPath(source, [
                "itemTitle",
                "item_title",
                "product.name",
                "items.0.product.name",
                "items.0.price.name",
                "details.line_items.0.product.name",
                "details.line_items.0.price.name"
            ]) || firstPath(lineItem, ["product.name", "price.name", "name"]),
            itemDescription: firstPath(source, [
                "itemDescription",
                "item_description",
                "description",
                "product.description",
                "items.0.product.description",
                "details.line_items.0.product.description"
            ]) || firstPath(lineItem, ["product.description", "description"]),
            itemPrice: formatProviderMoney(firstPath(source, [
                "itemPrice",
                "item_price",
                "subtotal",
                "details.totals.subtotal",
                "totals.subtotal"
            ]) || firstPath(lineItem, ["totals.subtotal", "total", "price.unit_price.amount"]), currency),
            priceTax: formatProviderMoney(firstPath(source, [
                "priceTax",
                "price_tax",
                "tax",
                "details.totals.tax",
                "totals.tax"
            ]), currency),
            discount: formatProviderMoney(firstPath(source, [
                "discount",
                "discountAmount",
                "discount_amount",
                "details.totals.discount",
                "totals.discount"
            ]), currency),
            priceTotal: formatProviderMoney(firstPath(source, [
                "priceTotal",
                "price_total",
                "total",
                "details.totals.total",
                "totals.total"
            ]), currency),
            orderId: firstPath(source, [
                "orderId",
                "order_id",
                "transactionId",
                "transaction_id",
                "id"
            ]) || fallbackOrderId,
            paymentMethod: firstPath(source, [
                "paymentMethod",
                "payment_method",
                "paidWith",
                "paid_with"
            ]),
            cardBrand: cardBrandFromProvider(source),
            cardLast4: cardLast4FromProvider(source),
            purchaseDate: formatProviderDate(firstPath(source, [
                "purchaseDate",
                "purchase_date",
                "completed_at",
                "billed_at",
                "created_at",
                "createdAt",
                "updated_at"
            ]))
        });
    }

    function resolveElement(target) {
        if (!target && typeof document !== "undefined") {
            return document;
        }

        if (typeof target === "string" && typeof document !== "undefined") {
            return document.querySelector(target);
        }

        return target || null;
    }

    function elementMatches(element, selector) {
        var matcher;

        if (!element || element.nodeType !== 1) {
            return false;
        }

        matcher = element.matches ||
            element.msMatchesSelector ||
            element.webkitMatchesSelector;

        return matcher ? matcher.call(element, selector) : false;
    }

    function elementClosest(element, selector) {
        var current = element;

        while (current && current.nodeType === 1) {
            if (elementMatches(current, selector)) {
                return current;
            }

            current = current.parentElement;
        }

        return null;
    }

    function isInsideReceipt(element) {
        return Boolean(elementClosest(element, "[data-not-boring-receipt]"));
    }

    function findFieldElement(source, selector) {
        var matches = [];
        var index;

        if (!source) {
            return null;
        }

        if (elementMatches(source, selector)) {
            matches.push(source);
        }

        if (source.querySelectorAll) {
            matches = matches.concat(toArray(source.querySelectorAll(selector)));
        }

        for (index = 0; index < matches.length; index += 1) {
            if (!isInsideReceipt(matches[index])) {
                return matches[index];
            }
        }

        return null;
    }

    function collect(source) {
        var rootElement = resolveElement(source);
        var data = {};
        var key;
        var element;

        for (key in FIELD_DEFINITIONS) {
            if (hasOwn(FIELD_DEFINITIONS, key)) {
                element = findFieldElement(rootElement, FIELD_DEFINITIONS[key].selector);
                data[key] = element ? element.textContent : EMPTY_VALUE;
            }
        }

        return normalize(data);
    }

    function mergeData(base, overrides) {
        var merged = {};
        var key;

        base = base || {};
        overrides = overrides || {};

        for (key in base) {
            if (hasOwn(base, key)) {
                merged[key] = base[key];
            }
        }

        for (key in overrides) {
            if (hasOwn(overrides, key) && overrides[key] !== undefined) {
                merged[key] = overrides[key];
            }
        }

        return merged;
    }

    function createMarkup(options) {
        var assetBase = options && options.assetBase ? String(options.assetBase).replace(/\/?$/, "/") : "assets/";
        var statusIconUrl = options && options.statusIconUrl ? options.statusIconUrl : assetBase + "complete.svg";

        return [
            '<div class="not-boring-receipt" data-not-boring-receipt>',
            '    <div class="printer">',
            '        <div class="company-logo printer-logo"></div>',
            '        <div class="info-tab">',
            '            <div class="item-title item-title-printer"></div>',
            '            <div class="item-description item-description-printer"></div>',
            '            <div class="price-label">Total</div>',
            '            <div class="price-total price-total-printer"></div>',
            '            <div class="transaction-status">',
            '                <img src="' + statusIconUrl + '" alt="Status icon" class="status-icon">',
            '                Order complete',
            '            </div>',
            '        </div>',
            '        <div class="receipt-output-tab">',
            '            <div class="receipt">',
            '                <div class="company-logo receipt-logo"></div>',
            '                <div class="divider divider-top">........................................................</div>',
            '                <div class="item-title item-title-receipt"></div>',
            '                <div class="item-description item-description-receipt"></div>',
            '                <div class="item-price item-price-line"></div>',
            '                <div class="divider divider-items">........................................................</div>',
            '                <div class="subtotal-label">Subtotal</div>',
            '                <div class="item-price item-price-subtotal"></div>',
            '                <div class="tax-label">Tax</div>',
            '                <div class="price-tax"></div>',
            '                <div class="discount-label">Discount</div>',
            '                <div class="discount"></div>',
            '                <div class="total-label">TOTAL PAID</div>',
            '                <div class="price-total price-total-receipt"></div>',
            '                <div class="divider divider-total">........................................................</div>',
            '                <div class="order-label">Order</div>',
            '                <div class="order-id order-id-value"></div>',
            '                <div class="payment-label">Paid with</div>',
            '                <div class="payment-method"></div>',
            '                <div class="date-label">Date</div>',
            '                <div class="purchase-date"></div>',
            '                <svg class="bar-code" role="img" aria-label="Order barcode"></svg>',
            '                <div class="order-id hri"></div>',
            '            </div>',
            '            <div class="output-1"></div>',
            '        </div>',
            '    </div>',
            '</div>'
        ].join("");
    }

    function findWidget(target) {
        var element = resolveElement(target);

        if (!element) {
            return null;
        }

        if (elementMatches(element, "[data-not-boring-receipt]")) {
            return element;
        }

        if (element.querySelector) {
            return element.querySelector("[data-not-boring-receipt]");
        }

        return null;
    }

    function writeText(widget, selector, value) {
        var elements = toArray(widget.querySelectorAll(selector));
        var index;

        for (index = 0; index < elements.length; index += 1) {
            elements[index].textContent = value;
        }
    }

    function applyLogo(widget, logoUrl) {
        var logos;
        var index;

        if (!logoUrl) {
            return;
        }

        logos = toArray(widget.querySelectorAll(".company-logo"));

        for (index = 0; index < logos.length; index += 1) {
            logos[index].style.backgroundImage = 'url("' + String(logoUrl).replace(/"/g, '\\"') + '")';
        }
    }

    function code128Values(text) {
        var sanitized = normalizeValue(text);
        var values = [104];
        var checksum = 104;
        var index;
        var charCode;
        var value;

        for (index = 0; index < sanitized.length; index += 1) {
            charCode = sanitized.charCodeAt(index);
            value = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
            values.push(value);
            checksum += value * (index + 1);
        }

        values.push(checksum % 103);
        values.push(106);

        return values;
    }

    function drawBarcode(svg, orderId) {
        var values = code128Values(orderId);
        var namespace = "http://www.w3.org/2000/svg";
        var x = 0;
        var valueIndex;
        var pattern;
        var widthIndex;
        var width;
        var rect;
        var totalWidth = 0;

        if (!svg || typeof document === "undefined") {
            return;
        }

        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        for (valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
            pattern = CODE_128_PATTERNS[values[valueIndex]];

            for (widthIndex = 0; widthIndex < pattern.length; widthIndex += 1) {
                totalWidth += Number(pattern.charAt(widthIndex));
            }
        }

        svg.setAttribute("viewBox", "0 0 " + totalWidth + " 40");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("aria-label", "Barcode for order " + normalizeValue(orderId));

        for (valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
            pattern = CODE_128_PATTERNS[values[valueIndex]];

            for (widthIndex = 0; widthIndex < pattern.length; widthIndex += 1) {
                width = Number(pattern.charAt(widthIndex));

                if (widthIndex % 2 === 0) {
                    rect = document.createElementNS(namespace, "rect");
                    rect.setAttribute("x", x);
                    rect.setAttribute("y", "0");
                    rect.setAttribute("width", width);
                    rect.setAttribute("height", "40");
                    svg.appendChild(rect);
                }

                x += width;
            }
        }
    }

    function restartPrintAnimation(widget) {
        var receipt = widget.querySelector(".receipt");

        if (!receipt) {
            return;
        }

        receipt.style.animation = "none";
        receipt.offsetHeight;
        receipt.style.animation = "";
    }

    function render(target, data, options) {
        var host = resolveElement(target);
        var widget;
        var receipt;

        options = options || {};

        if (!host) {
            throw new Error("NotBoringReceipt.render requires a target element.");
        }

        widget = findWidget(host);

        if (!widget) {
            host.innerHTML = createMarkup(options);
            widget = findWidget(host);
        }

        receipt = normalize(data || {});

        writeText(widget, ".item-title", receipt.itemTitle);
        writeText(widget, ".item-description", receipt.itemDescription);
        writeText(widget, ".item-price", receipt.itemPrice);
        writeText(widget, ".price-tax", receipt.priceTax);
        writeText(widget, ".discount", receipt.discount);
        writeText(widget, ".price-total", receipt.priceTotal);
        writeText(widget, ".order-id", receipt.orderId);
        writeText(widget, ".payment-method", receipt.paymentMethod);
        writeText(widget, ".purchase-date", receipt.purchaseDate);

        if (receipt.hasDiscount || options.showDiscount === true) {
            widget.classList.add("show-discounts");
        } else {
            widget.classList.remove("show-discounts");
        }

        applyLogo(widget, options.logoUrl || data && data.logoUrl);
        drawBarcode(widget.querySelector(".bar-code"), receipt.orderId);
        restartPrintAnimation(widget);

        return receipt;
    }

    function mount(options) {
        var target;
        var collected = {};
        var data;
        var receipt;
        var handle;

        options = options || {};
        target = resolveElement(options.target || options.container || options.element);

        if (!target) {
            throw new Error("NotBoringReceipt.mount requires a target, container, or element.");
        }

        if (options.source) {
            collected = collect(options.source);
        }

        data = mergeData(collected, options.data || options.receipt || {});
        receipt = render(target, data, options);

        handle = {
            element: findWidget(target),
            data: receipt,
            update: function (nextData, nextOptions) {
                var combinedOptions = mergeData(options, nextOptions || {});
                handle.data = render(target, nextData || {}, combinedOptions);
                return handle.data;
            },
            printFromCheckout: function (source, overrides, nextOptions) {
                var checkoutData = collect(source);
                var combined = mergeData(checkoutData, overrides || {});
                var combinedOptions = mergeData(options, nextOptions || {});

                handle.data = render(target, combined, combinedOptions);
                return handle.data;
            },
            destroy: function () {
                target.innerHTML = "";
                handle.element = null;
                handle.data = null;
            }
        };

        return handle;
    }

    function printFromCheckout(options) {
        options = options || {};

        if (!options.target) {
            throw new Error("NotBoringReceipt.printFromCheckout requires a target.");
        }

        return mount({
            target: options.target,
            source: options.source,
            data: options.data || options.overrides || {},
            logoUrl: options.logoUrl,
            assetBase: options.assetBase,
            statusIconUrl: options.statusIconUrl,
            showDiscount: options.showDiscount
        });
    }

    return {
        collect: collect,
        createMarkup: createMarkup,
        fromProviderPayload: fromProviderPayload,
        mount: mount,
        normalize: normalize,
        printFromCheckout: printFromCheckout,
        render: render
    };
}));
