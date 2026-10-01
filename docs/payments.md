# Payment processing strategy

**Status:** research memo, 2026-10-01. **Owner:** founder / payments lead.
**Scope:** Gnarcadia (Ontario corporation, Toronto) — real-money, skill-based multiplayer browser PWA arcade. Entry fees are pooled per match, the winner is paid, and the platform keeps a disclosed fee. Launch footprint: Ontario, Alberta, British Columbia, Nova Scotia; California, Colorado, Missouri, New York, Ohio, Pennsylvania. Year-one target 2k–5k active players, roughly US$20k–200k/month in deposits.

> **Disclaimer.** This document is research to inform counsel and vendor selection. It is not legal, tax or accounting advice. Vendor pricing and policies change frequently; every figure below is dated and sourced, and anything marked *quote-based* or *unverified* must be confirmed with the vendor in writing before it is relied upon.

---

## 1. Why the original wishlist does not work as written

The founder's wishlist was: cards, bank direct deposit (ACH/EFT), Interac e-Transfer, Venmo and Zelle. Three of those five are fine. Venmo and Zelle are not viable merchant rails for this business, and it is better to understand why than to spend months discovering it.

### 1.1 Zelle

Zelle is a bank-owned P2P network (Early Warning Services, owned by seven large US banks) that is **only available through participating banks' own apps**; there is no third-party developer API, and enrollment, limits and fees are set bank-by-bank rather than by Zelle ([NerdWallet: Zelle for Business](https://www.nerdwallet.com/business/software/reviews/zelle-for-business), [Productmint: how Zelle makes money](https://productmint.com/how-does-zelle-make-money/)). The standard Zelle network terms that banks republish prohibit using the service "to send money for gambling debts or payments otherwise prohibited by law" and state that the consumer service is for personal, not business or commercial use ([Zelle terms as republished by Southside Bank](https://www.southside.com/uploads/cms/ZelleTermsConditions2023v4.12.2023.pdf), [Zelle Network Standard Terms](https://empowerfcu.com/getattachment/2f125438-6664-4104-bf23-c0efc1636c55/Zelle-Network-Standard-Terms.pdf?lang=en-US)). Practically: there is no programmatic `createDeposit`/`createPayout`, no webhook, no reconciliation feed and no dispute process, and a Canadian corporation cannot hold the US business bank account a "Zelle for Business" profile requires. **Decision: drop.**

### 1.2 Venmo (and PayPal/Braintree)

Venmo is a PayPal product and is only offered to merchants through PayPal Checkout or Braintree. Venmo's own user agreement prohibits gambling and prohibits commercial use without a registered business profile ([Venmo user agreement, acceptable use](https://conductatlas.com/platform/venmo/venmo-user-agreement/acceptable-use-and-prohibited-activities/)). More importantly, PayPal's Acceptable Use Policy requires **pre-approval** for "games of skill (whether or not legally defined as gambling)", fantasy sports and sweepstakes, and only where "the operator and customers are located exclusively in jurisdictions where such activities are permitted by law" ([PayPal AUP](https://www.paypal.com/us/legalhub/acceptableuse-full); summary at [Conduct Atlas](https://conductatlas.com/platform/paypal/paypal-acceptable-use-policy/gambling-and-gaming-pre-approval-requirement/)). The Braintree AUP mirrors this ([Braintree AUP](https://www.paypal.com/legalhub/braintree/acceptable-use-policy)). The pre-approval request goes to `aup@paypal.com` with contact details, website URL and a business summary.

PayPal does approve select skill-gaming operators. Skillz lists PayPal as a deposit and withdrawal method and, in its SEC filings, describes depositing by credit card or PayPal with withdrawals returned to the same instrument ([Skillz FY2021 10-K](https://www.sec.gov/Archives/edgar/data/1801661/000162828022004552/sklz-20211231.htm)). What those approvals have in common: years of processing history, a public legal position on skill vs. chance, state-by-state geofencing, mature KYC, and volumes in the hundreds of millions. **Likelihood for a bootstrapped pre-launch operator: low in year one.** It is still worth filing the AUP pre-approval request early (it is free, and a written "no" is useful evidence of good-faith effort for other underwriters), but nothing in the launch plan should depend on it. If approved later, PayPal (with Venmo in the US) plugs into the adapter as an additional deposit/payout method.

### 1.3 What replaces them

| Wishlist item | Replacement for launch | Notes |
|---|---|---|
| Venmo / Zelle (US) | US **pay-by-bank** (Aeropay, Trustly, or Plaid + a processor) for deposits; **ACH credit / RTP / FedNow** payouts; **Visa Direct / Mastercard Send** push-to-debit for instant payouts | Same "from my bank" experience the founder wanted from Venmo/Zelle, with an API, webhooks and a dispute framework |
| Bank direct deposit (Canada) | **Interac e-Transfer** (Request Money for deposits, Autodeposit-enabled send for payouts) plus **EFT** for larger payouts | Interac Online was discontinued 31 Oct 2024; its online-debit successor is "Interac Debit for in-app/in-browser" via wallets, which only a few acquirers expose so far |
| Cards | Visa / Mastercard credit and debit, **Apple Pay and Google Pay** through the same acquirer | Expect MCC 7994/7995-adjacent treatment and 3DS2 on every deposit |
| Optional later | **Skrill / Neteller / paysafecard** (Paysafe), **Play+** (Sightline), **PayPal** if approved | E-wallets reduce card chargebacks; Play+ is US-only and quote-based |

---

## 2. Rails explained

### 2.1 Cards (Visa/Mastercard, Apple Pay, Google Pay)

Cards will be the most-used deposit method in the US and a large minority in Canada. Points that matter for underwriting and cost:

- **Classification.** Card networks treat skill gaming as a restricted or high-integrity-risk category. One payments-infrastructure guide notes that card-absent "games of skill" are coded MCC 5816 under Visa's integrity-risk program (tier 2), with the warning that too much chance in the game can get a merchant reclassified to gambling ([Basis Theory: skill games payments best practices](https://blog.basistheory.com/skill-games-payments-best-practices)). MCC 7995 (betting/casino/lottery) is tier 1, the highest-scrutiny band, and issuers can block 7995 outright ([PXP: MCC 7995](https://www.pxp.io/mcc-codes/7995-betting-and-casino-gambling), [Inpay: 7995 in iGaming](https://www.inpay.com/news-and-insights/understanding-7995-payments-in-igaming/)). MCC 7994 is video game arcades, a low-risk code for physical venues ([PXP: MCC 7994](https://www.pxp.io/mcc-codes/7994-video-game-arcades-and-establishments)). The acquirer, not the merchant, picks the MCC; the goal is to be coded as skill gaming (5816 or an equivalent the acquirer uses for DFS) rather than 7995.
- **Registration and reserves.** The acquirer registers restricted-category merchants with the schemes, passes through registration fees, and expects a legal basis in every operating jurisdiction ([CommerceGate: Visa high-brand-risk registration](https://www.commercegate.com/visa-high-brand-risk-merchant-registration-program/)). First-time gaming merchants typically see rolling reserves of 5–10% of monthly volume held 90–180 days ([Seamless Chex: what operators need for approval](https://www.seamlesschex.com/deep-dives/what-online-gambling-operators-need-to-get-payment-approval)).
- **Apple Pay / Google Pay** are tokenized card transactions through the same acquirer and need no separate underwriting. As a PWA, Gnarcadia is not gated by Apple's guideline 5.3 (no IAP for real-money gaming; licensed and geo-restricted), though it is a useful statement of platform expectations ([Apple Developer Forums: 5.3](https://developer.apple.com/forums/thread/95279), [Why some industries ship PWAs](https://commandlinux.com/blog/why-some-industries-ship-pwas-instead-of-app-store-builds/)).
- **Dispute exposure.** Visa's evolved Acquirer Monitoring Program (VAMP) consolidated its fraud and dispute programs in April 2025; the merchant "excessive" threshold is 1.5% (TC40 fraud + TC15 disputes over settled count) from 1 April 2026, and acquirer-level thresholds are far lower (0.5–0.7%), so acquirers police merchants aggressively ([Chargeback Gurus: VAMP changes](https://www.chargebackgurus.com/blog/visa-announces-even-more-vamp-changes), [Equifax: VAMP explainer](https://www.equifax.com/newsroom/all-news/-/story/the-visa-acquirer-monitoring-program-vamp-what-new-rules-mean-for-acquirers-and-merchants/)).

### 2.2 US pay-by-bank and ACH

Pay-by-bank (open-banking-authorized ACH debit, increasingly with RTP/FedNow instant credits for payouts) is the DFS industry's preferred funding and withdrawal rail because it is cheaper than cards and has no issuer 7995 blocks.

- **Aeropay** explicitly lists DFS, sweepstakes, tournaments and skill-based gaming among supported verticals and publishes volume tiers (0–499, 500–4,999, 5,000–9,999, 10,000+ transactions) but not prices ([Aeropay gaming](https://www.aeropay.com/gaming), [G2: Aeropay pricing](https://www.g2.com/products/aeropay/pricing)). Aeropay's own cost comparison puts modern pay-by-bank at roughly 1–1.5% plus a small flat fee versus 2.5–3.5% for cards ([Aeropay: pay-by-bank merchant cost comparison](https://www.aeropay.com/blog/pay-by-bank-merchant-cost-comparison)). Worldpay resells Aeropay to its gaming merchants ([Payments Dive](https://www.paymentsdive.com/news/worldpay-taps-aeropay-for-gaming-payments-A2A-ACH-realtime/729667/)).
- **Trustly** markets Pay by Bank for gaming with instant payouts to US bank accounts and names sportsbooks and DFS among its merchants ([Trustly: Pay by Bank for gaming](https://www.trustly.com/us/gaming), [Trustly Instant Payouts launch](https://www.trustly.com/us/press/trustly-launches-instant-payouts-in-the-us)). Pricing is quote-based; Trustly historically prefers larger operators.
- **Plaid + processor.** Plaid Transfer is priced per transfer plus per item under a commercial agreement after a Transfer application; sandbox is free ([Plaid Transfer application](https://plaid.com/docs/transfer/application/)). Plaid does not itself underwrite gaming; the sponsor bank/processor behind Transfer does, so treat this as a fallback that needs Plaid's risk team to approve the use case.
- **Rules that shape the integration.** Nacha's WEB Debit Account Validation Rule requires a commercially reasonable validation (instant account verification, micro-deposits, prenote) before the first debit of a new account ([Stripe: Nacha validation rule](https://support.stripe.com/questions/nacha-bank-account-validation-rule)). Nacha return-rate thresholds are 0.5% unauthorized, 3% administrative and 15% overall ([Modern Treasury: ACH return thresholds](https://docs.moderntreasury.com/payments/docs/ach-return-risk-thresholds)). Under Regulation E, consumers can dispute an unauthorized debit for 60 days after the statement, and the bank returns it (R10) with little recourse for the merchant ([Paytia: Regulation E](https://www.paytia.com/glossary/regulation-e), [Forte: ACH chargebacks](https://support.forte.net/support/solutions/articles/11000054154-ach-chargebacks)). Instant payouts over RTP/FedNow are credits and are not Reg E-reversible, which is why "same-source withdrawal" plus a short hold on first deposits is standard.

### 2.3 Canada: Interac e-Transfer, Interac Debit, EFT

- **Interac e-Transfer** is the dominant Canadian online gaming funding method. For deposits, use **Request Money** (the player accepts a request in their banking app; capped at $3,000 per request) and register **Autodeposit** on the receiving account so inbound transfers settle without a security question. Business limits are up to $25,000 per transfer with bulk sends to up to 100,000 recipients per day ([VoPay: Interac e-Transfer for Business guide](https://blog.vopay.com/interac-e-transfer-for-business-guide/), [Interac: send and receive with e-Transfer for Business](https://www.interac.ca/en/payments/business/send-receive-money-with-interac-e-transfer-for-business/)).
- **Fees.** From 1 November 2025, Interac moved to a flat wholesale fee that financial institutions pay per transaction (reported at roughly 4–8 cents, with $0.05 cited for Send Money and retail Request Money); what a business pays is set by its bank or aggregator, not by Interac ([Interac: understanding fees](https://www.interac.ca/en/payments/business/understanding-fees/), [Competition Bureau monitoring statement](https://www.canada.ca/en/competition-bureau/news/2025/07/competition-bureau-monitoring-interacs-commitment-on-e-transfer-pricing.html), [The Logic](https://thelogic.co/briefing/competition-bureau-monitoring-as-interac-commits-to-flat-fee-e-transfers-by-nov-1/)). Gaming aggregators charge far more than wholesale: one third-party estimate for Payper is $0.50–1.00 per deposit and $1.00–1.50 per withdrawal (unverified; treat as order-of-magnitude) ([igamingpaymentsolutions.com: Payper review](https://igamingpaymentsolutions.com/providers/payper)).
- **Fraud and reversibility.** An e-Transfer is paid to whoever answers the security question correctly, and one sent to an Autodeposit-registered recipient cannot be cancelled ([VoPay e-Transfer terms](https://vopay.com/en-ca/legal/services/etransfer/), [Scotiabank: cancelling e-Transfers](https://www.scotiabank.com/ca/en/personal/bank-your-way/digital-banking-guide/banking-basics/cancel-interac-e-transfer-transactions.html), [National Bank: Autodeposit](https://www.nbc.ca/personal/help-centre/bank-account/deposit-transfer/cancel-interac-e-transfer-autodeposit.html)). This is good news for deposits (near-zero chargebacks: Payper claims about one in 10,000) and a liability for payouts (a payout to a hijacked email is gone). Consumer protection for debit cards lives in the voluntary [Canadian Code of Practice for Consumer Debit Card Services](https://www.canada.ca/en/financial-consumer-agency/services/industry/laws-regulations/debit-card-code-conduct.html), monitored by FCAC, which allocates unauthorized-use losses between bank and cardholder, not merchant; e-Transfer disputes are handled bank-to-bank under Interac rules rather than by merchant chargeback.
- **Interac Online is gone; Interac Debit online is new.** Interac Online was discontinued on 31 October 2024 ([Kindred Credit Union notice](https://www.kindredcu.com/whats-new/announcements/interac-online-discontinued)). Its successor for e-commerce is Interac Debit through digital wallets (Apple Pay/Google Pay) and bank redirects, which Interac began exposing through Stripe in early 2026 ([Interac: Interac Debit for online and in-app with Stripe](https://www.interac.ca/en/content/news/interac-debit-is-now-available-for-online-and-in-app-payments-with-stripes-customers/)). Since Stripe declined Gnarcadia, ask Nuvei and Paysafe whether they expose Interac Debit online; if not, Interac e-Transfer plus cards covers Canada well.
- **EFT** (Payments Canada batch debit/credit) is the rail for payouts above Interac limits; Paramount Commerce routes payouts above CAD 25,000 to EFT automatically ([igamingpaymentsolutions.com: Paramount review](https://igamingpaymentsolutions.com/providers/paramount-commerce)).

### 2.4 E-wallets: Skrill, Neteller, paysafecard

All three are Paysafe products and standard on North American iGaming cashiers; Skrill USA was enhanced specifically for US iGaming ([Paysafe news](https://www.paysafe.com/us-en/paysafegroup/news/skrill-usa-enhances-digital-wallet-for-igaming/)). Gaming merchant pricing is unpublished; historical disclosures put Neteller's gaming merchant fee near 3.1% and Skrill's standard rate below 2% with gaming "slightly higher" ([Value Investors Club analysis of Neteller](https://valueinvestorsclub.com/idea/Neteller/4423363378), [Wise: Neteller vs Skrill](https://wise.com/gb/blog/neteller-vs-skrill)). paysafecard vouchers are available in Canada and the US but one acquirer lists $0.13 plus 10–12% ([2000charge](https://www.2000charge.com/paysafecard), [Finextra](https://www.finextra.com/pressarticle/45482/paysafecard-arrives-in-canada)). Wallets cut card chargebacks but each adds underwriting. **Recommendation: phase 2, under a Paysafe contract that already covers cards.**

### 2.5 Push-to-card payouts: Visa Direct and Mastercard Send

Original Credit Transactions push winnings to a debit card in minutes. Industry sources put cost at roughly $1–3 per payout versus pennies for ACH, and note issuers may block gaming-coded OCTs ([Seamless Chex: cutting fraud and declines](https://www.seamlesschex.com/deep-dives/cutting-fraud-and-declines-on-gambling-payment-processing)). Both Nuvei and Paysafe offer push-to-card as part of their gaming payouts; Payper and PayNearMe also list Visa Direct/Mastercard Send. Use as the "instant withdrawal" premium option, with ACH/EFT/Interac as the default.

### 2.6 Prepaid: Play+ (Sightline)

Play+ is a US-only, FDIC-insured prepaid wallet with a Visa/Mastercard debit card, live with 80+ operators across 44 states; consumer fees are public (free to load from a bank, free to fund an operator, $2 ATM, $2.95 inactivity after 12 months) but operator economics are entirely custom (interchange share, monthly platform fee, integration fee) ([igamingpaymentsolutions.com: Sightline review](https://igamingpaymentsolutions.com/providers/sightline-payments), [Sightline prepaid](https://sightlinepayments.com/prepaid), [Sightline selects J.P. Morgan as processor](https://www.sightlinepayments.com/sightline-selects-j-p-morgan-payments-as-primary-processor-for-play/)). Play+ moves custody of balances to the issuing bank, but Sightline has focused on licensed casinos and sportsbooks. **Recommendation: ask, but do not plan around it below ~$250k/month of US volume.**

---

## 3. Vendor comparison

All pricing is as reported in October 2026 by the vendor or by third-party reviews; none of these vendors publish a gaming rate card. "Legal opinion" means a US state-by-state skill-gaming opinion letter (and a Canadian Criminal Code s.206 opinion) from gaming counsel; underwriters for every vendor below will ask for one. "Reserve" is the rolling reserve a new gaming merchant should expect.

| Vendor (HQ) | Countries | Deposit methods | Payouts | Reported pricing | Monthly minimum | Onboarding requirements | Integration | Typical approval | Fit for Gnarcadia |
|---|---|---|---|---|---|---|---|---|---|
| **Nuvei** (Montreal) | US (state-by-state), Canada, 50+ markets | Cards, Apple/Google Pay, Interac e-Transfer, Interac Instant, ACH, 700+ APMs | Visa Direct/Mastercard Send, ACH, Interac send | 1.5–3.5% on deposits, custom; 5–10% rolling reserve ~6 months, 10–15% if chargebacks >1% ([review](https://igamingpaymentsolutions.com/providers/nuvei), [comparison](https://tech-insider.org/ca/igt-stripe-vs-worldpay-vs-nuvei-for-licensed-gambling-card-ca-d172/)) | Quote-based; extra diligence above $25k/month ([Merchant Cost Consulting](https://merchantcostconsulting.com/lower-credit-card-processing-fees/nuvei-review-pricing-statement-audit/)) | Legal opinion, AML/RG policies, financials, processing history, scheme registration | Hosted cashier (Simply Connect) or REST API + webhooks | 4–8 weeks (industry norm; unverified) | **Primary candidate**: one contract for cards + Interac in Canada and cards in the US; DFS references (DraftKings, FanDuel) |
| **Paysafe** (London/Montreal; US iGaming in Jacksonville) | US (DFS/iGaming states), Canada incl. Ontario launch 2022 | Cards, ACH, Pay-by-bank, Skrill, Neteller, paysafecard, Paysafecash, crypto-to-fiat | Visa Direct/Mastercard Send, ACH, Skrill | Quote-based; reviews suggest best value above ~$500k/yr card volume ([TheFinRate review](https://thefinrate.com/paysafe-review-2026-high-risk-merchant-accounts-fees-approval-rates/)) | Quote-based | Legal opinion, licensing or legal basis per state, AML/RG | Unified API, hosted checkout, 3DS2 built in ([Paysafe 3DS2](https://developer.paysafe.com/en/api-docs/3ds/test-and-go-live/3d-secure-2-results-and-liability-shift/)) | 4–8 weeks (unverified) | **Alternate primary** or phase-2 wallet add-on ([Paysafe iGaming](https://www.paysafe.com/us-en/industries-we-serve/igaming/), [Ontario launch](https://www.businesswire.com/news/home/20220404005315/en/Paysafe-Strengthens-Canadian-iGaming-Presence-With-Ontario-Market-Launch)) |
| **Aeropay** (Chicago) | US only | Pay-by-bank (ACH with bank-login auth), RTP/FedNow | Instant payouts to bank (RTP/FedNow), ACH | Quote-based, 4 volume tiers; industry pay-by-bank ~1–1.5% + $0.15–0.25 ([Aeropay](https://www.aeropay.com/gaming), [G2](https://www.g2.com/products/aeropay/pricing)) | Quote-based (asks volume on intake) | Legal opinion, state list, KYC flow description | Hosted widget / SDK + webhooks | 2–6 weeks (unverified) | **Primary US bank rail**; explicitly names skill-based gaming and tournaments |
| **Trustly** (Stockholm; US in Chicago) | US (also Canada for some merchants, unverified for gaming) | Pay-by-bank | Instant Payouts (US) | Quote-based ([Trustly gaming](https://www.trustly.com/us/gaming)) | Quote-based; skews enterprise | Legal opinion, AML | Hosted lightbox + API | 4–8 weeks (unverified) | Backup to Aeropay |
| **Paramount Commerce** (Toronto) | Canada | Interac e-Transfer, online banking pay-by-bank (4 methods) | Instant payouts up to CAD 25k; mass payouts up to CAD 100k with EFT above 25k | Base fee + % with volume and industry discounts; not published ([Paramount pricing](https://www.paramountcommerce.com/pricing), [review](https://igamingpaymentsolutions.com/providers/paramount-commerce)) | Quote-based | Legal opinion (Canada), FINTRAC-aware AML program, incorporation docs | Hosted checkout or API + webhooks ([Rebilly gateway listing](https://www.rebilly.com/gateways/paramountinterac)) | 2–6 weeks (unverified) | **Primary Interac rail**: local, gaming-focused, payouts built in |
| **Payper** (Ontario, FINTRAC MSB since 2023) | Canada | Interac e-Transfer, enhanced EFT online banking, digital cheque | EFT direct deposit, Visa Direct, Mastercard Send; 7-day processing | Not published; third-party estimate $0.50–1.00/deposit, $1.00–1.50/withdrawal; no rolling reserve claimed ([review](https://igamingpaymentsolutions.com/providers/payper), [Wise guide](https://wise.com/ca/blog/payper-interac-e-transfer-guide)) | Quote-based | Lighter than Paramount per reviews; still expect legal opinion | API + hosted | 1–4 weeks (unverified) | **Alternate Interac rail** for a bootstrap; weekend processing is a plus |
| **Gigadat** (Winnipeg, FINTRAC MSB) | Canada | Interac e-Transfer (the processor behind most Canadian casino cashiers) | Interac send | Custom, no rate card ([review](https://igamingpaymentsolutions.com/providers/gigadat)) | Quote-based | Legal opinion, AML | API + hosted | Unverified | Third Interac option; strong bank coverage (250+ FIs) |
| **Sightline / Play+** (Las Vegas) | US only | Play+ prepaid wallet, bank/debit loads, cash loads | Withdraw to Play+ then ATM/bank | Custom: interchange share + monthly platform fee + integration fee ([review](https://igamingpaymentsolutions.com/providers/sightline-payments)) | Quote-based, likely significant | Operator must be a regulated or clearly legal gaming business | API | 8–12 weeks (unverified) | Phase 3 at best |
| **Worldpay** (Cincinnati/London) | US, Canada, global | Cards, APMs, Aeropay pay-by-bank via partnership | Push-to-card, ACH | Quote-based; enterprise-oriented ([Payments Dive](https://www.paymentsdive.com/news/worldpay-taps-aeropay-for-gaming-payments-A2A-ACH-realtime/729667/)) | Quote-based; high | Legal opinion, licensing, strong financials | API, hosted pages | 8–12 weeks (unverified) | Unlikely to onboard at $20k/month; revisit at scale |
| **PayNearMe / MoneyLine** (Santa Clara) | US | Cards, ACH, cash at retail, PayPal, Venmo (through PayNearMe's own approvals) | Push-to-debit, PayPal, Venmo, ACH ([PayNearMe payouts](https://home.paynearme.com/moneyline/payouts/)) | Quote-based | Quote-based; built for licensed iGaming | Operator licensing or legal basis; legal opinion | Single API + hosted "Smart Link" | 8–12 weeks (unverified) | Interesting because it can expose PayPal/Venmo payouts under its umbrella; ask whether it serves skill gaming |
| **Coinflow Labs** (Chicago) | US (cards global), payouts US/EU/UK/BR | Cards, Apple/Google Pay, ACH, crypto; settles merchant in USDC within minutes and indemnifies 100% of chargebacks on approved transactions | Same-day/standard ACH, Venmo, Apple Pay push-to-card ([Coinflow payouts docs](https://docs.coinflow.cash/guides/payouts/payout-overview)) | 2.5–3.5% on card deposits plus variable chargeback-protection fee; payouts priced in MSA ([review](https://igamingpaymentsolutions.com/providers/coinflow-labs)) | Quote-based | Legal opinion; treasury must be willing to hold USDC | Hosted checkout components + API | 2–4 weeks (unverified) | Credible **US card fallback** because chargeback indemnification removes the biggest underwriting objection; stablecoin settlement is a treasury/accounting decision for counsel and the accountant |
| Generalist "high-risk" ISOs (PaymentCloud, EasyPayDirect; Pay.com has no visible gaming program) | US | Cards | Limited | 3.5–6% + reserves ([PaymentCloud online gaming](https://paymentcloudinc.com/industries/online-gaming/)) | Low | Legal opinion | Gateway | 1–3 weeks | Last resort; costlier than the processor being replaced |

Not included: Stripe (declined Gnarcadia; its AUP excludes unapproved real-money gaming), Checkout.com (minimum volume too high for now), Adyen (enterprise), Dwolla/Moov/Payload (gaming and fantasy sports are prohibited or restricted on their platform agreements, e.g. [Moov prohibited businesses](https://moov.io/legal/platform-agreement/prohibited-restricted-businesses/)).

**Requirements common to every vendor above:** a skill-gaming legal opinion covering each launch state and a Canadian opinion; an AML/KYC policy; a responsible-gaming page; T&Cs with the fee and payout schedule; a geofence; and a rolling reserve on cards for the first six months. The Interac-only Canadian aggregators are the exception on reserves because e-Transfer deposits are effectively irrevocable.

---

## 4. Recommended launch stack

### 4.1 Architecture

```
Player (PWA)
   |
   |-- Canada ---> Paramount Commerce (Interac e-Transfer Request Money; payouts via Interac send / EFT)
   |           \-> Nuvei (cards, Apple/Google Pay; 3DS2)              [fallback: Payper for Interac, Paysafe for cards]
   |
   |-- US ------> Aeropay (pay-by-bank deposits; RTP/FedNow payouts)
               \-> Nuvei or Paysafe (cards, Apple/Google Pay; Visa Direct payouts)   [fallback: Coinflow for cards]
   |
Gnarcadia ledger (double-entry; player sub-ledger; match escrow accounts)
   |
Segregated player-funds bank account(s) per currency  <-- settlement from processors
Operating account  <-- platform fee sweep only
```

- **Canada, deposits:** Interac e-Transfer Request Money through Paramount (or Payper) as the default; Nuvei cards as the second option. Interac deposits carry effectively no chargeback risk and should be steered to with a small UX nudge ("instant, no card needed").
- **Canada, payouts:** Interac send with Autodeposit through the same aggregator; EFT for anything above CAD 25,000 (rare at this stage).
- **US, deposits:** Aeropay pay-by-bank as the default; cards via Nuvei or Paysafe. Keep the first-deposit card limit low (e.g. $100) and raise it with tenure.
- **US, payouts:** Aeropay instant payout (RTP/FedNow) or standard ACH credit; Visa Direct via the card acquirer as the "instant to debit card" premium option.
- **Fallbacks:** Coinflow (US cards, chargeback-indemnified), Payper or Gigadat (Interac), Trustly (US bank). Because the `PaymentProvider` adapter is uniform, a fallback is a configuration change plus a webhook route.
- **Negotiate one contract per country where possible.** Nuvei can in principle cover cards and Interac in Canada and cards in the US; the question is whether its Interac pricing beats a specialist. Get both quotes.

### 4.2 Cost model

Assumptions (stated so they can be changed): 50/50 Canada/US volume; average deposit $25; withdrawals equal to ~70% of deposits at an average of $70; Canadian deposits 70% Interac / 30% cards; US deposits 50% pay-by-bank / 50% cards; Interac aggregator fee $1.25 per deposit and $1.25 per payout; US pay-by-bank 1.25% + $0.20; cards 3.0% + $0.30 (Canada) and 3.25% + $0.30 (US) inclusive of scheme fees; US payouts blended $1.00 (mix of ACH credit and Visa Direct); fixed monthly fees (gateway, PCI, minimums) $300–1,000 depending on how many vendors have minimums. Chargebacks (roughly $15–25 each plus the lost deposit) are excluded and should be budgeted at 0.3–0.5% of card volume.

| | $20k/month deposits | $100k/month deposits |
|---|---|---|
| Deposits | 800 | 4,000 |
| Canada Interac ($7k / $35k) | 280 × $1.25 = **$350** | 1,400 × $1.25 = **$1,750** |
| Canada cards ($3k / $15k) | $90 + $36 = **$126** | $450 + $180 = **$630** |
| US pay-by-bank ($5k / $25k) | $63 + $40 = **$103** | $313 + $200 = **$513** |
| US cards ($5k / $25k) | $163 + $60 = **$223** | $813 + $300 = **$1,113** |
| Payouts ($14k / $70k; 200 / 1,000 payouts) | CA 100 × $1.25 + US 100 × $1.00 = **$225** | CA 500 × $1.25 + US 500 × $1.00 = **$1,125** |
| Fixed fees and minimums | **$300–1,000** | **$500–1,000** |
| **Total processing cost** | **~$1,300–2,000 (6.5–10% of deposits)** | **~$5,600–6,100 (5.6–6.1%)** |
| Rolling reserve (10% of card volume, 180 days) | $800/month, peaking near **$4,800** held | $4,000/month, peaking near **$24,000** held |

Two conclusions. First, at $20k/month fixed minimums dominate, so prefer vendors with no or low minimums (Payper, Aeropay's lowest tier, Nuvei with a negotiated waiver) and resist adding a fourth vendor until volume justifies it. Second, the mix matters more than the rate: every deposit moved from card to Interac or pay-by-bank saves roughly 2 points and most of the chargeback and reserve exposure. If the platform fee is 10% of entry fees, processing at 6–10% of deposits consumes most of the gross margin at launch; the rake, minimum entry fee and deposit-size nudges should be designed with this table in mind.

### 4.3 Flow of funds and custody

**Who holds player balances.** Three models:

1. **Merchant operating account (commingled).** Simplest, and what the previous Toronto processor implied. Not recommended: a player's unspent balance is then just an unsecured claim on Gnarcadia, processors and counsel dislike it, and it is the pattern regulators cite when operators fail.
2. **Segregated player-funds account owned by Gnarcadia** (one per currency, at a Canadian bank and, if obtainable, a US bank), with a double-entry sub-ledger that reconciles daily to the bank balance and the processors' settlement reports. Only the platform fee is swept to operating. This is the practical answer for a bootstrap and mirrors the player-funds segregation that Ontario's Registrar's Standards expect of licensed operators (see [compliance.md](./compliance.md)). Processor settlement, reserves and payouts all flow through this account.
3. **Processor- or bank-custodied balances** (Play+ wallet, Skrill wallet, or an FBO account at a sponsor bank through a BaaS provider). An FBO account keeps funds in the bank's name for the benefit of users and is the standard way fintechs avoid holding customer money directly ([Modern Treasury: what is an FBO account](https://www.moderntreasury.com/learn/what-is-an-fbo-account), [Kotapay on FBO and money transmission](https://www.kotapay.com/forbenefitof)). Sponsor banks that will open an FBO for a real-money gaming startup are rare; this is a phase-2 upgrade.

**Money-transmitter exposure.** In the US, FinCEN exempts from the money-transmitter definition a person who accepts and transmits funds "only integral to the sale of goods or the provision of services" other than money transmission (31 CFR 1010.100(ff)(5)(ii)(F)); FinCEN's rulings require that the transmission be necessary to a distinct service and performed by the service provider itself ([FIN-2014-R011](https://www.fincen.gov/sites/default/files/administrative_ruling/FIN-2014-R011.pdf), [Wilson Sonsini: how gaming companies become inadvertent MSBs](https://wsgr.com/en/insights/how-gaming-companies-can-become-inadvertent-money-services-businesses.html), [Perkins Coie summary](https://perkinscoie.com/en/news-insights/admin-rulings-fincen-clarifies-money-transmitter-exemptions-for.html)). The design choices that keep Gnarcadia inside that exemption: balances are only usable for entry fees; no player-to-player transfers; withdrawals go back to the same source (or a verified account in the same name); no stored value that can be redeemed for anything but cash to the owner. State money-transmission laws differ from FinCEN's and some states regulate stored value broadly, so counsel should review California, New York, Colorado, Missouri, Ohio and Pennsylvania specifically. In Canada, an MSB is a business offering foreign exchange, money transferring, virtual currency dealing, money orders or crowdfunding platform services ([Substance Law: what is FINTRAC](https://substancelaw.ca/what-is-fintrac/)); FINTRAC's special bulletin on online gambling is addressed to PSPs, MSBs and banks that service gambling sites, which is a reminder that the processors will apply gambling-style AML scrutiny whether or not Gnarcadia is a reporting entity ([FINTRAC bulletin](https://fintrac-canafe.canada.ca/intel/bulletins/gambling-jeu-eng.pdf), [BLG commentary](https://www.blg.com/en/insights/2024/02/know-when-to-fold-em-special-bulletin-on-money-laundering-through-online-gambling-sites)).

**Dispute handling by rail.**

| Rail | Reversal window | Who adjudicates | Merchant exposure |
|---|---|---|---|
| Cards | 120 days (scheme rules) | Issuer / scheme via acquirer | Full amount + fee; counts toward VAMP ratios |
| ACH debit (US) | 60 days under Reg E for consumers | Consumer's bank returns (R10/R11) | Full amount; counts toward Nacha 0.5% unauthorized threshold |
| RTP/FedNow/ACH credit (payout) | None (credit push) | n/a | Mis-sent funds are a loss |
| Interac e-Transfer deposit | None once deposited | Interac/bank fraud process | Near zero |
| Interac e-Transfer payout | None once Autodeposited | Interac/bank fraud process | Account-takeover losses |
| Visa Direct / Mastercard Send | None | n/a | Mis-sent funds are a loss |

**Chargeback and fraud mitigation (card and ACH):** 3DS2 on every card deposit so true-fraud liability shifts to the issuer ([Adyen: 3DS liability shift](https://docs.adyen.com/online-payments/3d-secure-for-regulation-compliance), [PCI Proxy: 3DS and gambling chargebacks](https://www.pci-proxy.com/blog-posts/3d-secure-online-casino-gambling-chargebacks)); AVS and CVV match; BIN country equals verified address country; velocity limits per card, account and device (e.g. 3 deposits or $300 per 24h for new accounts); **deposit-to-play** (a deposit cannot be withdrawn until entered into at least one match); **same-source withdrawals** (winnings up to the deposited amount return to the deposit instrument, the remainder to a verified bank account in the same name, which is also Skillz's stated policy); a 24–72h hold on first withdrawals; name match across KYC, card and bank; a recognizable descriptor with support URL and phone; Visa Order Insight / Mastercard Ethoca enrolment; proactive refunds on obvious first-party disputes; and a 0.65% internal dispute-ratio ceiling, well under VAMP's 1.5%.

---

## 5. Integration notes: mapping vendors to the `PaymentProvider` adapter

The adapter has `createDeposit`, `createPayout`, and `verifyWebhook`. Vendors differ mainly in whether a deposit is a redirect/hosted session or a client-side token, and in how payouts identify the destination.

| Adapter call | Nuvei | Paysafe | Aeropay | Paramount / Payper (Interac) | Coinflow |
|---|---|---|---|---|---|
| `createDeposit` | Open order server-side, render hosted checkout (Simply Connect / Cashier) or Web SDK; 3DS handled by vendor; result arrives by DMN webhook | Create a payment handle via Payments API, then settle; hosted checkout option; 3DS2 inside | Create a transaction after the player links a bank in Aeropay's hosted widget; returns a transaction id and status | Create a Request Money (or hosted Interac page) with amount and player reference; player accepts in banking app; status via webhook/callback when funds Autodeposit | Create a checkout session; hosted components collect card; settlement webhook |
| Webhooks | Direct Merchant Notification with HMAC checksum: approved, declined, chargeback, refund | Webhook with signature over payload; payment, settlement, chargeback events | Transaction status webhooks: pending, completed, failed, returned | Deposit completed, failed/expired request, payout sent/failed, returned | Settlement, dispute (indemnified), payout events |
| `createPayout` | Payout API to card token (Visa Direct/Mastercard Send) or bank | Standalone credit to card or bank via payouts API | Payout to the linked bank (RTP/FedNow instant or ACH) | Interac send to email/phone with Autodeposit, or EFT with account details above limit | Payout to bank (ACH same-day/standard) or Venmo/Apple Pay push |
| KYC data | Pass verified name, DOB, address, IP in the order; required for payouts | Same; Paysafe may require document evidence for larger payouts | Account-holder name match from the linked bank; share KYC status | Name on bank account is returned on deposit; use it to confirm name match | KYC performed by Coinflow for withdrawers above thresholds |
| Reconciliation | Daily settlement report / API | Settlement reports | Settlement and return reports | Settlement reports | USDC settlement ledger |

Implementation rules that apply across vendors:

- **Idempotency.** Every `createDeposit`/`createPayout` carries a Gnarcadia-generated idempotency key and the vendor's transaction id is stored before any ledger write.
- **Webhooks are the source of truth.** Never credit a balance on the redirect-return page; credit only on a verified `settled`/`completed` webhook, and support out-of-order delivery (a chargeback can arrive for a deposit that was credited months earlier).
- **Signature verification** in `verifyWebhook` must use the vendor's documented scheme (HMAC with a secret or an asymmetric signature) and reject replays by timestamp and nonce.
- **Ledger events.** Map vendor events to a small internal set: `deposit.pending`, `deposit.settled`, `deposit.failed`, `deposit.returned` (ACH/chargeback), `payout.sent`, `payout.failed`, `payout.returned`. Returns create a negative balance and a collections flag; the account is frozen until cured.
- **Hosted fields only.** No card data touches Gnarcadia's servers or DOM, which keeps PCI scope at SAQ A (with the v4.0.1 script-integrity expectations covered in [compliance.md](./compliance.md)).
- **Geo and KYC gates run before `createDeposit`**, not after; vendors increasingly require the merchant to attest that the player was geolocated and verified at the time of the transaction.

### 5.1 Onboarding checklist

Prepare one data room and reuse it for every vendor.

1. **Corporate:** Ontario articles of incorporation, corporate profile report, director/officer IDs, ownership chart (anyone over 25%), proof of business address.
2. **Banking:** bank letter or void cheque for the segregated player-funds account and the operating account; ask whether US processors settle to Canadian USD accounts or require a US account.
3. **Legal:** skill-gaming opinion letter for each launch state plus a Canadian Criminal Code s.206 opinion (game-mechanics analysis, state tests, attorney attestation; structure described at [terms.law](https://terms.law/Demand-Letters/Gaming/skills-based-gaming-platform-legal-hub.html)); T&Cs, privacy policy, responsible-gaming page, fee disclosure, geofence policy and excluded-jurisdiction list.
4. **Compliance:** written AML/KYC program, sanctions screening, fraud and chargeback controls, retention policy, named compliance officer.
5. **Financial:** 3–6 months of bank statements, the prior processor's statements (they show chargeback history), a 12-month volume forecast with average ticket.
6. **Product:** staging site with the cashier visible, an underwriter test account, screenshots of deposit, match entry, payout and self-exclusion, and a one-page description of a match (entry fee, pool, fee, payout).
7. **Technical:** PCI SAQ A attestation, hosted-field summary, webhook endpoint and IP allow-list, sandbox credentials request.

---

## 6. What to tell processors

Underwriters are pattern-matching against three fears: that this is unlicensed gambling, that it will generate chargebacks, and that it will be used to launder money. The pitch should pre-empt all three in the first paragraph.

**One-paragraph description (adapt per vendor):** "Gnarcadia is a Toronto-based operator of head-to-head and tournament video games in which players pay a fixed, disclosed entry fee and the highest score wins the pooled prize; the platform retains a disclosed fee. Outcomes are determined by player skill with no random element affecting results; every game is reviewed against a published skill standard and we hold a state-by-state legal opinion from gaming counsel. Players are geolocated on every paid entry and blocked outside our approved list of provinces and states; all players are identity-verified before their first withdrawal and age-verified before their first deposit. Deposits are only usable for entry fees, withdrawals return to the funding source, and we operate a written AML and responsible-gaming program. We are requesting classification as a skill-gaming / fantasy-contest merchant, not as a casino or betting operator."

**MCC and descriptor.** Ask for the acquirer's skill-gaming or DFS code (Visa's integrity program treats card-absent games of skill as MCC 5816, tier 2) rather than 7995, and document why: no wager on an uncertain event, no house edge, no random number generation determining outcomes ([Basis Theory](https://blog.basistheory.com/skill-games-payments-best-practices)). Use a billing descriptor such as `GNARCADIA*ENTRYFEE` with the support phone and URL; never use "casino", "bet" or "win" in the legal name, trade name, domain, descriptor or app title. Keep the public site's language consistent: "entry fee", "prize pool", "tournament", "skill-based competition", not "wager", "stake", "bet", "jackpot", "odds" or "gamble".

**Evidence to attach:** the legal opinion; the excluded-jurisdiction list (the industry baseline excludes states such as Arkansas, Connecticut, Delaware, Louisiana and South Dakota for cash contests, with more conservative operators also excluding Arizona, Indiana, Iowa, Maine, Montana, South Carolina and Tennessee: [Skillz legal](https://www.skillz.com/legal/), [Atay Games 2026 state guide](https://ataygames.com/blogs/is-skill-based-gaming-legal-in-your-state)); the geolocation vendor and decision rules; the KYC vendor and tiers; screenshots of the pre-entry fee disclosure; the responsible-gaming controls (deposit limits, cooling-off, self-exclusion); the chargeback-control list in section 4.3; and a forecast that is honest about volume. Underwriters reward conservatism: a $20k/month merchant that promises $2m will be priced and reserved for the risk of $2m.

**Things not to say:** "like a casino but legal"; any comparison to sweepstakes casinos; crypto settlement (unless the vendor is Coinflow); "Canada-wide" or "US-wide" (name the provinces and states); and never minimize the previous processor relationship: disclose it and its chargeback history.

**Negotiation points:** reserve percentage and release (ask for 5% / 90 days with a 6-month review), a minimum-fee waiver for 6 months, no early-termination fee, itemized scheme pass-throughs, the chargeback fee, payout pricing separate from deposits, settlement currency and timing (T+1/T+2 to the segregated account), and the MCC and scheme registrations in writing.

---

## 7. Open questions for counsel and vendors

1. Confirm the MSB/money-transmitter analysis for the segregated-account model in each launch state and under the PCMLTFA, including whether any state treats a withdrawable skill-gaming balance as stored value.
2. Confirm whether the Canadian legal opinion can rely on Criminal Code s.206 "pure skill" without the "mixed chance and skill" issue that sank GotSkill in Ontario in 2025 ([CasinoBeats](https://casinobeats.com/2025/09/05/ontario-gotskill-skill-games-ruling-us-comparison/)); matchmaking, seeds and game selection must be shown to add no chance to outcomes.
3. Ask Nuvei and Paysafe for Interac Debit (online) availability and pricing, and whether a single contract can cover Canada and the US.
4. Ask Aeropay and Paramount for their lowest tier's monthly minimum in writing.
5. File the PayPal AUP pre-approval request and record the response.
6. Decide, with the accountant, whether USDC settlement (Coinflow) is acceptable as a fallback and how it would be converted and reported.
