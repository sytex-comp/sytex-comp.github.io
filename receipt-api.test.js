(function () {
    "use strict";

    var results = document.getElementById("test-results");
    var sandbox = document.getElementById("test-sandbox");
    var tests = [];

    function test(name, callback) {
        tests.push({
            name: name,
            callback: callback
        });
    }

    function assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }

    function text(selector, root) {
        var element = (root || document).querySelector(selector);
        return element ? element.textContent : "";
    }

    function resetSandbox() {
        sandbox.innerHTML = "";
    }

    function sourceMarkup(fields) {
        var html = '<section class="checkout-source">';
        var key;

        for (key in fields) {
            if (Object.prototype.hasOwnProperty.call(fields, key)) {
                html += '<div class="' + key + '">' + fields[key] + '</div>';
            }
        }

        html += "</section>";
        return html;
    }

    test("collect reads purchase fields from a checkout DOM source", function () {
        resetSandbox();
        sandbox.innerHTML = sourceMarkup({
            "item-title": "Team Plan",
            "item-description": "Quarterly subscription",
            "item-price": "$120.00",
            "price-tax": "$20.00",
            "discount": "$30.00",
            "order-id": "ORD-9821",
            "payment-method": "Visa &bull;&bull;&bull;&bull; 4242",
            "purchase-date": "20 AUG 2026"
        });

        var receipt = NotBoringReceipt.collect(sandbox.querySelector(".checkout-source"));

        assert(receipt.itemTitle === "Team Plan", "item title was not collected");
        assert(receipt.itemDescription === "Quarterly subscription", "item description was not collected");
        assert(receipt.discount === "-$30.00", "discount should be normalized as a subtraction");
        assert(receipt.priceTotal === "$110.00", "total should be calculated when missing");
        assert(receipt.orderId === "ORD-9821", "order id was not collected");
    });

    test("mount prints checkout data and uses -- for unknown fields", function () {
        resetSandbox();
        sandbox.innerHTML = sourceMarkup({
            "item-title": "Starter License",
            "item-price": "$19.00",
            "price-tax": "$1.90",
            "price-total": "$20.90",
            "order-id": "START-1001",
            "payment-method": "Mastercard &bull;&bull;&bull;&bull; 4444",
            "purchase-date": "20 AUG 2026"
        }) + '<div id="receipt-target"></div>';

        var handle = NotBoringReceipt.mount({
            target: "#receipt-target",
            source: sandbox.querySelector(".checkout-source"),
            assetBase: "../assets/"
        });

        assert(handle.data.itemDescription === "--", "missing description should default to --");
        assert(text(".item-title", handle.element) === "Starter License", "receipt did not print checkout title");
        assert(text(".item-description", handle.element) === "--", "receipt did not print -- for missing description");
        assert(text(".price-total", handle.element) === "$20.90", "receipt did not print checkout total");
        assert(handle.element.textContent.indexOf("Pro Plan") === -1, "receipt still contains old default item data");
        assert(handle.element.textContent.indexOf("SOK-2048") === -1, "receipt still contains old default order data");
    });

    test("barcode SVG is generated from the order id", function () {
        resetSandbox();
        sandbox.innerHTML = '<div id="receipt-target"></div>';

        var handle = NotBoringReceipt.mount({
            target: "#receipt-target",
            assetBase: "../assets/",
            data: {
                itemTitle: "API Access",
                itemPrice: "$49.00",
                priceTax: "$0.00",
                priceTotal: "$49.00",
                orderId: "API-2048",
                paymentMethod: "Visa \u2022\u2022\u2022\u2022 4242",
                purchaseDate: "20 AUG 2026"
            }
        });

        assert(handle.element.querySelectorAll(".bar-code rect").length > 20, "barcode bars were not generated");
        assert(text(".hri", handle.element) === "API-2048", "barcode human-readable id was not updated");
        assert(handle.element.querySelector(".bar-code").getAttribute("aria-label").indexOf("API-2048") !== -1, "barcode label does not include the order id");
    });

    test("direct provider objects can update the same receipt without provider lock-in", function () {
        resetSandbox();
        sandbox.innerHTML = '<div id="receipt-target"></div>';

        var handle = NotBoringReceipt.mount({
            target: "#receipt-target",
            assetBase: "../assets/"
        });

        var receipt = handle.update({
            itemTitle: "Annual Seat",
            itemDescription: "",
            itemPrice: "$100.00",
            priceTax: "$0.00",
            discount: "$25.00",
            orderId: "paddle_txn_123",
            cardBrand: "Visa",
            cardLast4: "8991",
            purchaseDate: "2026-08-20"
        });

        assert(receipt.itemDescription === "--", "blank description should default to --");
        assert(receipt.priceTotal === "$75.00", "discount should be counted into the calculated total");
        assert(receipt.paymentMethod === "Visa \u2022\u2022\u2022\u2022 8991", "card brand and last four should become a masked card label");
        assert(text(".discount", handle.element) === "-$25.00", "discount was not printed as a subtraction");
        assert(text(".payment-method", handle.element) === "Visa \u2022\u2022\u2022\u2022 8991", "masked card label was not printed");
        assert(handle.element.classList.contains("show-discounts"), "discount row should be visible for real discounts");
    });

    test("provider payloads map to normalized receipt fields inside the API", function () {
        var receipt = NotBoringReceipt.fromProviderPayload({
            transaction: {
                id: "txn_provider_123",
                created_at: "2026-08-20T19:43:00Z",
                details: {
                    totals: {
                        subtotal: "900",
                        tax: "140",
                        discount: "0",
                        total: "1040",
                        currency_code: "USD"
                    },
                    line_items: [
                        {
                            product: {
                                name: "Pro Plan",
                                description: "Monthly Subscription"
                            }
                        }
                    ]
                },
                payments: [
                    {
                        method_details: {
                            card: {
                                type: "visa",
                                last4: "8991"
                            }
                        }
                    }
                ]
            }
        });

        assert(receipt.itemTitle === "Pro Plan", "provider product name was not mapped");
        assert(receipt.itemDescription === "Monthly Subscription", "provider product description was not mapped");
        assert(receipt.itemPrice === "$9.00", "provider subtotal was not formatted");
        assert(receipt.priceTax === "$1.40", "provider tax was not formatted");
        assert(receipt.priceTotal === "$10.40", "provider total was not formatted");
        assert(receipt.orderId === "txn_provider_123", "provider transaction id was not mapped");
        assert(receipt.paymentMethod === "Visa \u2022\u2022\u2022\u2022 8991", "provider card details were not masked");
        assert(receipt.purchaseDate !== "--", "provider purchase date was not mapped");
    });

    test("normalize returns -- for every missing receipt field", function () {
        var receipt = NotBoringReceipt.normalize({
            orderId: "ONLY-ID"
        });

        assert(receipt.itemTitle === "--", "missing item title should be --");
        assert(receipt.itemDescription === "--", "missing item description should be --");
        assert(receipt.itemPrice === "--", "missing item price should be --");
        assert(receipt.priceTax === "--", "missing tax should be --");
        assert(receipt.discount === "--", "missing discount should be --");
        assert(receipt.priceTotal === "--", "missing total should be --");
        assert(receipt.paymentMethod === "--", "missing payment method should be --");
        assert(receipt.purchaseDate === "--", "missing date should be --");
    });

    function run() {
        var passed = 0;
        var index;
        var item;

        results.innerHTML = "<h1>Receipt API Tests</h1>";

        for (index = 0; index < tests.length; index += 1) {
            item = document.createElement("div");

            try {
                tests[index].callback();
                passed += 1;
                item.className = "test-pass";
                item.textContent = "PASS: " + tests[index].name;
            } catch (error) {
                item.className = "test-fail";
                item.textContent = "FAIL: " + tests[index].name + " - " + error.message;
            }

            results.appendChild(item);
        }

        results.insertAdjacentHTML("beforeend", "<p>" + passed + " / " + tests.length + " passing</p>");
    }

    run();
}());
