# DahonMD detailed user journeys

This is the screen-level checklist for the current Android app, website and API (October 7, 2026). It covers every exposed role area and the meaningful choices a person can take. Pages 9–16 of the [editable draw.io map](dahonmd-role-user-flows-2026-10-07.drawio) show these paths. Pages 1–8 provide the short overview and cross-role states. Some tasks below are alternatives; a user does not perform every row in one session.

| Diagram page | Journey |
| --- | --- |
| 9 | Guest entry on Android and the public website |
| 10 | Farmer Android scan, local History, sync and errors |
| 11 | Farmer website scan, result variants and History |
| 12 | Farmer expert review, consent and account controls |
| 13 | Agriculturist queue, assessment and follow-up |
| 14 | Agriculturist content verification and dataset decisions |
| 15 | Administrator accounts, dashboard and diagnosis audit |
| 16 | Administrator knowledge, articles, research and analytics |

## Guest: no farmer account yet

| ID | Where and what the guest does | Branch and visible result |
| --- | --- | --- |
| G01 | Android **Scan** → Camera or Gallery → preview → **Check leaf**. | The bundled model runs on the phone without an API call. A rejected or wrong photo leads to another photo. |
| G02 | On the result, inspect the class, score, image advice, other model scores, and Guide link; choose **Retake** or another scan. | The score is screening support, not a confirmed diagnosis. If local saving fails, use **Retry save**. |
| G03 | Open **History**, filter and expand the saved scan; view its photo and details, add/remove approximate location, or delete it. | The guest scan is stored on that device. Deletion asks for confirmation. |
| G04 | Open **Guide** and the available offline article library; change language from Account. | Content may refresh on a future connection; the bundled guide remains available. |
| G05 | Tap **Ask an expert** on the Android result or a saved History scan, with an optional concern about the AI result. | The app asks for farmer sign-in, then resumes the request. A connection and uploaded photo are needed to complete the expert handoff. |
| G06 | Android **Account** → **Sign in** or the smaller **Create account** link. | If server connection fails, retry it or use the server QR/address settings. Android scanning still works offline. |
| G07 | Website landing → choose language → **Scan a leaf now** → camera, image file, or development sample → **Check leaf**. | Web screening calls the connected inference service. If unavailable, return to Scan and retry; the sample is for interface testing. |
| G08 | Inspect the website result, model scores and advice; retake if uncertain. | Saving or requesting review opens farmer login. The full website Guide/Library is available after login. |
| G09 | Login, farmer signup, forgot-password/reset, or email verification. | New signup accepts the terms with research consideration disclosed. Staff roles are created by an administrator, not public signup. |
| G10 | After signing in on Android, choose **Add device scans** if local guest scans are offered. | Transfer is explicit. Skipping it leaves those scans on the device; failed transfers can be retried. |

## Farmer: signed-in scan and advice

| ID | Where and what the farmer does | Branch and visible result |
| --- | --- | --- |
| F00 | Open Android/web **Home** to see saved scans, uncertain results, pending sync, new reviews and a next action. | Start a scan or open History directly from its prompt. Offline Home still shows the phone's local counts. |
| F01 | Android **Home** or **Scan** → Camera/Gallery → preview → **Check leaf**. | A wrong or unusable photo can be replaced. Classification runs offline with the bundled four-class model. |
| F02 | Read the Android result and next-step advice; retake, open the matching Guide, optionally add scan location, or explain why the AI seems wrong. | Local History saves the original AI result. The on-result **Ask an expert** action does not require a trip to History. |
| F03 | Android **History** → filter → expand a card inline. | View photo, AI score, date, sync status, expert status and any expert outcome. History also offers CSV export. |
| F04 | Add or remove approximate location from result/History. | Location is optional, rounded to about 110 m, and not required for classification or review. |
| F05 | Let a signed-in phone sync cases and photos; use **Try again** after failed sync/deletion or **Resend photo** when a requested review lacks an uploaded image. | Offline scans remain local/queued until connected. A changed tunnel address may require reconnecting and signing in again. |
| F06 | Website **Scan** → camera, file or development sample → preview → **Check leaf**. | A connected service returns the screening. The experimental model comparison, when available, is a separate research view. |
| F07 | On a supported website result, **Save result**; on an uncertain result, retake, save without review, or **Save & ask an expert** with optional notes. | Service-unavailable and research-only comparison views do not create a supported saved diagnosis. |
| F08 | Website **History** → filter/select a case. | See the saved photo, AI result, sync state and any separate agriculturist review. Browser changes may wait in an outbox and retry on reconnection. |
| F09 | Ask an expert from the Android result, Android History or a saved web case. | A request requires a farmer account. The photo and case must reach the server; a low-score case may also be prioritized in the expert queue. |
| F10 | Watch the History state: waiting → in progress → new completed review → seen. | The agriculturist can agree, choose another class, say the photo is insufficient, flag another possible condition, or advise a field/lab check. |
| F11 | Open the completed review inline/on the saved case. | Read reviewer, verdict, farmer-facing message, next steps, submitted photo and original AI prediction; opening a new review marks it seen. |
| F12 | Reply to the reviewed case; optionally attach a clearer camera/gallery photo. | The same case returns to the expert queue. Prior assessments remain in its revision trail. |
| F13 | Open the Guide/Library from navigation or a result; ask Dahon about a synced case when connected. | These are supporting explanations, not a replacement for the agriculturist assessment. |
| F14 | Android **Account** → **Add device scans** when offered; manage name, email, password, profile photo, language and verification email. | Add device scans is shown only for local-only scans. Signing out of Android warns about unsent changes. |
| F15 | Change future research sharing in Account/Profile or withdraw consent for one scan in History. | An eligible reviewed photo enters the candidate queue automatically only while consent is current. Staff approval is separate; the AI model is not retrained. |
| F16 | Remove an approved private research photo from Account/Profile; retry pending removal if needed. | A research copy has its own removal path and can remain after ordinary scan deletion. |
| F17 | Delete one saved scan, sign out, or delete the account with a choice about approved research copies. | Destructive actions require confirmation. Normal scans and separately retained research copies have different deletion paths. |

## Agriculturist: review and independent decisions

| ID | Where and what the agriculturist does | Branch and visible result |
| --- | --- | --- |
| E01 | Sign in with a verified staff account. Android **Home** opens review requests; the web has **Review Queue**. | Staff work requires a server connection. A wrong role or unverified staff email blocks protected actions. |
| E02 | Open a farmer request or prioritized uncertain scan. | Opening an unreviewed case claims it; the claim renews while open and releases on exit. Another active claim blocks a competing save. |
| E03 | Inspect the full submitted photo, original AI class/score, farmer note, approximate location, earlier reviews/replies and recent scans. | Reference photos and the disease guide help comparison but do not prove a diagnosis. |
| E04 | Choose same supported class, different supported class, **Cannot determine**, **Possible other condition**, or **Field/laboratory check needed**. | If the photo is unavailable, the UI permits only **Cannot determine** until a photo arrives. |
| E05 | Choose a default farmer response or **Other** text; set image quality, next steps and an optional internal note; save. | The farmer sees the verdict and farmer message. Internal notes stay staff-only. A failed save remains retryable. |
| E06 | Open **Reviewed** or **Reviewed Cases** to inspect a completed answer and earlier versions. | These screens are read-only after completion. A farmer follow-up reopens the same case for a fresh assessment. |
| E07 | Open Android **Content → Disease records** or web **Disease Knowledge**; inspect researched claims, citations, image limits and regulatory caveats. | Verify, request revision or reject with notes. Only suitable verified advice is eligible for the farmer guide. |
| E08 | Read research sources and the article library. | Administrators maintain source and article records; expert access is for reading and content verification. |
| E09 | Open Android **Content → Dataset candidates** or the web grid; inspect photo, AI prediction, expert verdict, quality and current consent. | A completed reviewed photo enters automatically when eligible. The case's own assessor cannot approve it. |
| E10 | Choose **Approve**, **Keep uncertain**, or **Reject**, with notes. | Approval needs a good retained photo, current consent and a determinate completed review; only approval stores a separate private research copy. |
| E11 | Maintain profile photo, name/email, password, language and sign-out. | Session expiry or a failed connection requires authentication/retry before connected work resumes. |

## Administrator: operations and governance

| ID | Where and what the administrator does | Branch and visible result |
| --- | --- | --- |
| A01 | Sign in with a verified admin account and open Android **Home** or web **Dashboard**. | View live counts for farmers, scans, uncertainty, missing uploads and expert turnaround. Offline dashboard requests can be retried; phone classification is unaffected. |
| A02 | Android **Users** or web **Accounts** → search/select farmers or agriculturists. | Create, edit or delete accounts. Qualified agriculturist accounts are created by an admin; new/changed staff email needs verification. |
| A03 | Android **Scans** or web **Diagnoses** → filter/select a record. | Inspect photo, farmer, date, source, original AI class/score, provenance and separate expert verdict/revisions; delete when authorized. |
| A04 | Android **Knowledge → Diseases** or web **Disease Knowledge** card grid. | Maintain the four validated model-class records: farmer summary, signs, management, evidence, limitations and status. Unsupported classes are not added to the scanner. |
| A05 | Add/modify evidence, research citations and regulatory checks; submit researched disease content for agriculturist verification or archive it. | The expert may verify, request revision or reject. Verified content becomes eligible for farmer guidance. |
| A06 | Android **Knowledge → Sources** or web **Research Sources**. | Add/edit/delete source records and connect evidence to claims. |
| A07 | Android **Knowledge → Articles** or web **Article Library**. | Draft, edit, publish or remove articles; add licensed photos in either editor. Published articles require cited sources and reach phones on a connection. |
| A08 | Web **Dataset Candidates** → filter/inspect a candidate's photo, consent, AI result, expert verdict and image quality. | Approve, keep uncertain or reject with reason, subject to independent-review and quality checks. Android admin navigation does not expose this grid. |
| A09 | Web research-image audit → inspect approved copies and remove one with a reason; retry a pending file removal. | This is separate from ordinary diagnosis deletion and from model training. |
| A10 | Web **Analytics** → view activity, distribution, review turnaround and AI–agriculturist agreement. | Agreement is not laboratory accuracy; summaries distinguish server-verified from client-reported predictions. |
| A11 | Web **Model Comparison** or **Model Information**. | Inspect permitted comparison/system views. These actions do not train or replace the Android model. |
| A12 | Maintain admin profile/photo/password/language or sign out. | Staff work needs a valid session, verified email and connection. |

## State boundaries to explain during a defense

1. **Phone screening:** image → on-device preprocessing/model → local result. Internet and an account are not prerequisites.
2. **Account synchronization:** a signed-in farmer's case and photo reach Laravel through retryable sync. Old guest scans transfer only when the farmer selects **Add device scans**.
3. **Expert review:** a request or prioritized uncertain case enters the queue; an agriculturist claims and assesses it. The review is stored separately from the AI result.
4. **Research:** current consent + retained photo + completed review creates a pending candidate. An independent staff decision, quality gate and consent check are still required before retaining a private research copy.
5. **Recovery:** unsuccessful upload, photo transfer, deletion, connection and authentication are visible retry paths. Reviewed-case follow-up keeps earlier assessments.
