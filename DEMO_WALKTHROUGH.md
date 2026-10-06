# DahonMD live demo: actions and speaking script

Use this as a read-aloud guide while showing the Android app and website. Each **Do** line is the action on screen; read the **Say** paragraph while you do it. Pause after each step so the audience can see what changed. The leaf photo and predicted result may differ from one demonstration to another, so describe the result actually shown.

## Before the audience arrives

- Have the DahonMD APK installed on an Android phone and keep one clear, real banana leaf photo in its gallery. A single leaf in even light works best. Do not use a drawing or another object as the main example.
- Start the test website and API from the project folder. For an already installed app, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -Cloudflare -SkipPhone -AutoConnectPhone`. If this is the first installation and ADB recognizes an authorized phone, use `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -Cloudflare` instead. See [the automation guide](AUTOMATION_README.md) for setup and recovery details.
- Keep the printed HTTPS link. If ADB cannot connect the phone, open `<printed-link>/connect.html` in the phone browser and tap **Open DahonMD app**. Check for **Server connected** before signing in. Leave the computer and test services running.
- Open the printed website link on the computer. Have the farmer and agriculturist test accounts from [the README](README.md#demo-accounts) ready. Use the farmer account on the phone and the agriculturist account in the browser. Check that the example photo is appropriate to show to the audience.

## 1. Introduce the problem and the tool

**Do:** Show the phone's DahonMD **Scan** screen without choosing a photo yet.

**Say:** “When a banana leaf changes colour or develops spots, a farmer often needs a useful first step before an expert can visit. DahonMD helps screen a photo of the leaf and shows practical guidance. Today I’ll follow one leaf from taking a picture, to reading the result, to asking an agriculturist to check it. This is a screening aid, so the result helps us decide what to inspect next; it is not a laboratory diagnosis.”

## 2. Show how the phone connects

**Do:** On the phone, show **Server connected** or open **Account → Server address** to show the active test address. Then return to **Scan**.

**Say:** “The connection lets us sign in and share a saved scan with an agriculturist. The address on this phone points to the test server running on the computer. It is a temporary demonstration link, so a new run may have a new address. The leaf check itself runs on the phone; the connection is for the account, syncing, and expert review.”

## 3. Sign in as a farmer

**Do:** Open **Account**, sign in with the farmer test account, and return to **Scan**.

**Say:** “I’m signing in as a farmer so this scan can be saved to my account and sent for review. A person can also scan without signing in, but those signed-out scans stay on the phone until the person explicitly adds them to an account. Signing in now makes the full review process easier to follow.”

## 4. Choose a leaf photo

**Do:** Tap **Gallery** and choose the prepared banana leaf photo. If you have a physical leaf and good lighting, you can use **Camera** instead. Pause on the photo preview.

**Say:** “First, I choose a photo of one real banana leaf. I want the leaf to fill most of the picture, with the affected area in focus and as little shadow as possible. A clearer photo gives the model better information. If the preview is the wrong photo, I can use ‘Choose another photo’ before checking it.”

## 5. Run the leaf check

**Do:** Tap **Check the leaf** and wait for the result.

**Say:** “Now the app prepares the photo and runs its four-class model directly on this phone. It compares patterns for Healthy, Sigatoka, Panama disease, and Cordana leaf spot. This step can work without an internet connection. If the app says the image is not a real leaf photo, or says the photo is too unclear, we take a better picture rather than treating that as a disease result.”

## 6. Explain the result carefully

**Do:** Point to the condition name, percentage, and wording such as **Very likely**, **Likely**, or **Not sure**. Tap **More info** to reveal the other class scores.

**Say:** “The name here is the pattern the model matched most strongly in this photo: [read the condition shown]. The percentage is the model’s confidence among the supported classes. It is not the chance that this plant definitely has that disease. ‘More info’ shows how the model scored the other supported classes, which helps us see when the answer is close. If the app says ‘Not sure,’ or asks for a clearer photo, our next action is to retake it. A Panama disease result also needs field or laboratory confirmation before anyone treats it as a confirmed infection.”

## 7. Show the next step and the guide

**Do:** Read the **What to do now** card. If the result offers **See full treatment** or **See how to keep it healthy**, tap it to open **Guide**; otherwise show the clearer-photo advice. Return to **History** afterward.

**Say:** “The result is useful only if it leads to a sensible next step. This card tells us what to do immediately, and the Guide gives fuller information about the signs and care for this condition. We should compare what the guide describes with what we can actually see on the leaf. Any product or treatment decision still needs the correct diagnosis and current local guidance. The guide explains the condition; it does not turn this photo into a confirmed diagnosis.”

## 8. Show the saved scan

**Do:** Open **History** and open the scan you just made. Point out the photo, original AI result, and save or sync status.

**Say:** “The scan is saved in History, so the farmer can come back to the same photo and result instead of relying on memory. The original AI prediction stays visible even if an agriculturist later gives a different assessment. If the phone has no connection, the result remains on the device and account changes wait to sync when the connection returns.”

## 9. Ask an agriculturist

**Do:** On the scan result or the saved History entry, enter a short observation such as “The spots have spread across this leaf” in the optional note, then tap **Ask an expert**. If History shows a confirmation sheet, confirm **Send**. Wait for the request to appear as sent or waiting.

**Say:** “Here I’m adding something the photo may not explain: what I observed in the field. When I ask for review, the app sends this scan and its photo privately to the agriculturist through the test server. The farmer can follow its progress in History. Sharing a photo for review is separate from giving permission to use a photo for research; I have not given research consent in this step.”

## 10. Show the agriculturist's view

**Do:** On the computer, sign in to the website as the agriculturist. Open **Review Queue**, select the new case, and show the submitted photo, farmer note, and original AI result. Choose an assessment supported by the photo, add a short **Message to the farmer**, then click **Save assessment**. If the photo is insufficient, choose **Cannot determine from this photo** instead of guessing.

**Say:** “The agriculturist sees the same submitted leaf and the farmer’s note, along with what the AI originally suggested. They make their own assessment from the evidence available. If the image is too poor to judge, ‘Cannot determine from this photo’ is a valid answer. I’m adding a short message so the farmer understands what to check or do next. When I save this, the expert assessment becomes a separate part of the record; it does not erase the AI result.”

## 11. Return to the farmer's answer

**Do:** On the phone, return to **History** and open or refresh the same scan after it syncs. Show the expert assessment, message, and suggested next steps. If it has not appeared yet, wait for the connection and reopen History.

**Say:** “Now the farmer can read the agriculturist’s answer beside the original scan. That distinction matters: one part is the phone’s automated screening result, and the other is a person’s assessment of the submitted evidence. The farmer can use the message and next steps to decide whether to take another photo, continue monitoring, or arrange a field inspection.”

## 12. Close the demonstration

**Do:** Leave the reviewed scan visible, then point back to the **Scan**, **History**, and **Guide** tabs.

**Say:** “We started with one leaf photo, checked it on the phone, saved the result, looked up practical guidance, and requested a human review. Those steps are designed to make the result understandable and useful to a farmer. The phone can still perform a scan when the internet is unavailable; a connection is needed when we want the account and agriculturist to receive the scan. The final decision about a plant should use the leaf itself, field context, and expert or laboratory confirmation when needed.”
