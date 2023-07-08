//Rewrite for Node 18?
const { App, AwsLambdaReceiver, subtype } = require("@slack/bolt");
const { SocketModeClient } = require("@slack/socket-mode");
const { Stream } = require("stream");
const AWS = require("aws-sdk");
const {
  LambdaClient,
  InvokeCommand,
  InvokeAsyncCommand,
} = require("@aws-sdk/client-lambda");
const fetch = require("node-fetch");
const fs = require("fs");
//const { transform } = require('./imagetransform')

// Initialize your custom receiver
const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
});

//Lambda Client
const lambdaClient = new LambdaClient({
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
  },
});

const LambdaCommand = new InvokeCommand({
  FunctionName: "birthday-bot-node-to-image-dev-function1",
  Payload: JSON.stringify({ key: "Abee.jpg.jpg" }), // Should be the Image Key
});

/*
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true,
  socketMode: true, // add this
  appToken: process.env.SLACK_APP_TOKEN, // add this
});
*/

// Initializes your app with your bot token and the AWS Lambda ready receiver
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,

  // When using the AwsLambdaReceiver, processBeforeResponse can be omitted.
  // If you use other Receivers, such as ExpressReceiver for OAuth flow support
  // then processBeforeResponse: true is required. This option will defer sending back
  // the acknowledgement until after your handler has run to ensure your function
  // isn't terminated early by responding to the HTTP request that triggered it.
  
});


/*
const params = {Bucket: 'birthday-designs', Key: 'my-object-key'};
const url = s3.getSignedUrl('getObject', params);
console.log('The URL is', url);
*/

let viewMessage;
let lambdaJson;

const subTextArray = [
  "Have a beautiful year!",
  "Have a wonderful year!",
  "Have an amazing year!",
];

const uploadImageToS3 = async (fileUrlFromMessage, fileNameFromMessage) => {
  const fileUrl = fileUrlFromMessage;
  const downloadResponse = await fetch(fileUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  const outputFilename = fileNameFromMessage;
  const outputStream = fs.createWriteStream(outputFilename);
  await downloadResponse.body.pipe(outputStream);
  const transformed = await downloadResponse.buffer();

  s3.upload(
    {
      Bucket: "imgcroptest",
      Key: fileNameFromMessage,
      Body: transformed,
    },
    (err, data) => {
      if (err) {
        console.log("Error", err);
      }
      if (data) {
        console.log("Upload Success", data.Location);
      }
    }
  );
};

const transformImageFromS3 = async (fileKey) => {
  const imageRequest = JSON.stringify({
    bucket: "imgcroptest",
    key: fileKey,
    edits: {
      smartCrop: {
        faceIndex: 0, // zero-based index of detected faces
        padding: 500, // padding expressed in pixels, applied to all sides
      },
    },
  });
  const transformedRequestString = Buffer.from(imageRequest, "utf-8").toString(
    "base64"
  );
  const CloudFrontUrl = "https://d2gtl62twmopm.cloudfront.net";

  const editUrl = `${CloudFrontUrl}/${transformedRequestString}`;

  const grayResponse = await fetch(editUrl, {
    method: "GET",
  });
  const greyOutputFileName = "gray.jpg";
  const outputStreamGray = fs.createWriteStream(greyOutputFileName);
  await grayResponse.body.pipe(outputStreamGray);
  const transformedGray = await grayResponse.buffer();
  console.log(editUrl);
  return transformedGray;
};

const uploadToSlackTransformedImages = async (fileKey, body) => {
  s3.upload(
    {
      Bucket: "slack-transformed-images",
      Key: `${fileKey}`,
      ContentType: "image/jpeg",
      Body: body,
    },
    (err, data) => {
      if (err) {
        console.log("Error", err);
      }
      if (data) {
        console.log("Transformed Upload Success", data.Location);
      }
    }
  );
};

const generateBirthdayDesign = async (body, logger, client) => {
  const {
    view: {
      state: {
        values: {
          color_scheme: {
            select_btn: {
              selected_option: { value: colorScheme },
            },
          },
        },
      },
    },
  } = body;

  const name = body.view.state.values;
  console.log(body.view.state.values);
  console.log(colorScheme);

  await uploadImageToS3(
    viewMessage.files[0].url_private_download,
    viewMessage.files[0].name
  );
  const transformedImage = await transformImageFromS3(
    viewMessage.files[0].name
  );

  await uploadToSlackTransformedImages(
    viewMessage.files[0].name,
    transformedImage
  );

  const LambdaCommand = new InvokeCommand({
    FunctionName: "birthday-bot-node-to-image-dev-function1",
    Payload: JSON.stringify({ key: "Abee.jpg.jpg" }), // Should be the Image Key
  });
  const imagekey = `${viewMessage.files[0].name}`;
  const lambdaResponse = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: "birthday-bot-node-to-image-dev-function1",
      Payload: JSON.stringify({
        key: imagekey,
        name: name.input123.input_name.value,
        color: colorScheme,
      }), // Should be the Image Key
    })
  );
  lambdaJson = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
  console.log(lambdaResponse);
  console.log(lambdaJson);
};

app.shortcut("birthday_flyer", async ({ shortcut, ack, client, logger }) => {
  try {
    // Acknowledge shortcut request
    await ack();

    // Call the views.open method using one of the built-in WebClients
    const result = await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: "modal",
        callback_id: "birthday_modal",
        title: {
          type: "plain_text",
          text: "Create Birthday Flyer",
        },
        close: {
          type: "plain_text",
          text: "Close",
        },
        submit: {
          type: "plain_text",
          text: "Generate Design",
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Enter celebrant name, hit generate get you design in #random 😉",
            },
          },
          {
            type: "input",
            block_id: "input123",
            label: {
              type: "plain_text",
              text: "Enter name",
            },
            element: {
              type: "plain_text_input",
              action_id: "input_name",
              placeholder: {
                type: "plain_text",
                text: "Celebrant's First Name",
              },
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "Birthday Bot <https://api.slack.com/tools/block-kit-builder|*Changelog*>",
              },
            ],
          },

          {
            type: "actions",
            block_id: "color_scheme",
            elements: [
              {
                action_id: "select_btn",
                type: "static_select",
                placeholder: {
                  type: "plain_text",
                  text: "Color Scheme?",
                  emoji: true,
                },
                options: [
                  {
                    text: {
                      type: "plain_text",
                      text: "Silver",
                      emoji: true,
                    },
                    value: "silver",
                  },
                  {
                    text: {
                      type: "plain_text",
                      text: "Blue",
                      emoji: true,
                    },
                    value: "blue",
                  },
                  {
                    text: {
                      type: "plain_text",
                      text: "Papaya Whip 😉",
                      emoji: true,
                    },
                    value: "papaya-whip",
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    viewMessage = shortcut.message;
    //logger.info(result);
    //logger.info(shortcut.message)

    // Grab messages, save data to dynamodb - Trigger Runs, Grab data from Dynamo Db Generate Birthday Designs

    const now = Date.now();

    // Subtract 24 hours (86400000 milliseconds) from the current timestamp
    const yesterday = now - 86400000;

    const messagesBirthday = await client.conversations.history({
      channel: shortcut.channel.id,
      oldest: `${yesterday}`,
    });

    /*

    const resultCopyLink = await client.chat.postMessage({
      channel: shortcut.user.id,
      text: `Image link is ${viewMessage.files[0].url_private_download}.`
    });

    */

    // console.log(shortcut.channel)

    //console.log(viewMessage)
    //await uploadImageToS3(viewMessage.files[0].url_private_download, viewMessage.files[0].name)
    //const transformedImage = await transformImageFromS3(viewMessage.files[0].name);

    //await uploadToSlackTransformedImages(viewMessage.files[0].name, transformedImage);

    //Await function success try upload to transformed images
    // Call node-html-to-image from here and get response

    /*
    const lambdaResponse = await lambdaClient.send(LambdaCommand)
    lambdaJson = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
    console.log(lambdaResponse)
    console.log(lambdaJson)
    */
  } catch (error) {
    logger.error(error);
  }
});

//Maybe provide a download link after instead of sending back to chat

// Handle a view_submission request
app.view("birthday_modal", async ({ ack, body, view, client, logger }) => {
  // Acknowledge the view_submission request
  const val = view["state"]["values"]["input123"];

  const {
    view: {
      state: {
        values: {
          color_scheme: {
            select_btn: {
              selected_option: { value: colorScheme },
            },
          },
        },
      },
    },
  } = body;

  const name = body.view.state.values;
  const imagekey = `${viewMessage.files[0].name}`;

  const lambdaParams = {
    slackFileLink: viewMessage.files[0].url_private_download,
    fileName: imagekey,
    key: imagekey,
    name: name.input123.input_name.value,
    color: colorScheme,
  };

  const lambdaResponse = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: "birthday-bot-node-to-image-dev-function1",
      InvocationType: "Event",
      Payload: JSON.stringify(lambdaParams), // Should be the Image Key
    })
  );

  console.log(lambdaResponse);

  await ack({
    response_action: "update",
    view: {
      type: "modal",
      title: {
        type: "plain_text",
        text: "Request Received",
      },
      blocks: [
        {
          type: "section",
          text: {
            type: "plain_text",
            text: "Working on it. Hang Tight!",
          },
        },
      ],
    },
  });
});

// Listens to incoming messages that contain "hello"
app.message("hello", async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Hey there <@${message.user}>!`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Click Me",
          },
          action_id: "button_click",
        },
      },
    ],
    text: `Hey there <@${message.user}>!`,
  });
});

// Listens for an action from a button click
app.action("select_btn", async ({ body, ack, say, action, client }) => {
  await ack();
});

// Listens for an action from a button click
app.action(
  "generate_image",
  async ({ body, ack, say, action, client, logger }) => {
    await ack();

    const {
      view: {
        state: {
          values: {
            color_scheme: {
              select_btn: {
                selected_option: { value: colorScheme },
              },
            },
          },
        },
      },
    } = body;

    const name = body.view.state.values;
    console.log(body.view.state.values);
    console.log(colorScheme);
    try {
      // Call views.update with the built-in client
      const result = await client.views.update({
        // Pass the view_id
        view_id: body.view.id,
        // Pass the current hash to avoid race conditions
        hash: body.view.hash,
        // View payload with updated blocks
        view: {
          type: "modal",
          // View identifier
          callback_id: "birthday_modal",
          title: {
            type: "plain_text",
            text: "Request Received",
          },
          blocks: [
            {
              type: "section",
              text: {
                type: "plain_text",
                text: "Working on it. Hang Tight!",
              },
            },
          ],
        },
      });
      logger.info(result);
      // From Here Call Lambda Function that uses Web Api to send message to a private Channel
      // Notify If Errors Occur in a channel
    } catch (error) {
      logger.error(error);
    }
    await uploadImageToS3(
      viewMessage.files[0].url_private_download,
      viewMessage.files[0].name
    );
    const transformedImage = await transformImageFromS3(
      viewMessage.files[0].name
    );

    await uploadToSlackTransformedImages(
      viewMessage.files[0].name,
      transformedImage
    );

    const LambdaCommand = new InvokeCommand({
      FunctionName: "birthday-bot-node-to-image-dev-function1",
      Payload: JSON.stringify({ key: "Abee.jpg.jpg" }), // Should be the Image Key
    });
    const imagekey = `${viewMessage.files[0].name}`;
    const lambdaResponse = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: "birthday-bot-node-to-image-dev-function1",
        Payload: JSON.stringify({
          key: imagekey,
          name: name.input123.input_name.value,
          color: colorScheme,
        }), // Should be the Image Key
      })
    );
    lambdaJson = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
    console.log(lambdaResponse);
    console.log(lambdaJson);

    //Await function success try upload to transformed images
    // Call node-html-to-image from here and get response
  }
);

const welcomeChannelId = "C04LXD2JHLM";

// When a user joins the team, send a message in a predefined channel asking them to introduce themselves

app.event("team_join", async ({ event, client, logger }) => {
  try {
    // Call chat.postMessage with the built-in client
    const result = await client.chat.postMessage({
      channel: welcomeChannelId,
      text: `Welcome to the team, <@${event.user}>! 🎉 You can introduce yourself in this channel.`,
    });
    logger.info(result);
  } catch (error) {
    logger.error(error);
  }
});

/*
app.event('message', async ({ event, client, logger, say }) => {
  try {
    // Call chat.postMessage with the built-in client
    const result = await client.chat.postMessage({
      channel: welcomeChannelId,
      text: `Welcome to the team, 🎉 You can introduce yourself in this channel.`
    });

   const fullFilePath = 'found.png'

   await say(`Working on your image..., <@${event.user}> :wave:`);

   if(event.files && event.subtype == 'file_share') {  
        const fileUrl = event.files[0].url_private_download;
        const downloadResponse = await fetch(fileUrl, {
          method: "GET",
          headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
        });
        const outputFilename = event.files[0].name;
        const outputStream = fs.createWriteStream(outputFilename);
        await downloadResponse.body.pipe(outputStream);
        const transformed = await downloadResponse.buffer()
            
        s3.upload({
          Bucket: 'imgcroptest',
          Key: event.files[0].name,
          Body: transformed
        }, (err, data) => {
          if (err) {
            console.log("Error", err);
          } if (data) {
            console.log("Upload Success", data.Location);
            say(`Image Successfully Sent..., <@${event.user}> :wave:`);
          }
        })
   }
   



/*

    const res = await fetch('https://files.slack.com/files-pri/T04LKR03H8F-F04M61J2XM5/download/pablita-no-messages.png', {
        method: "GET",
        headers: {
          Authorization: `Bearer xoxb-4699850119287-4719021486260-Ds0sNpdtjqgpcT0Jge1hJvvr`
        }
    })

    
   // const blob = await res.buffer()


    
    const imageRequest = JSON.stringify({
      bucket: "imgcroptest",
      key: event.files[0].name,
      edits: {
        smartCrop: {
            faceIndex: 0,   // zero-based index of detected faces
            padding: 120,    // padding expressed in pixels, applied to all sides
        }
    }
  });
  const transformedRequestString = Buffer.from(imageRequest, 'binary').toString('base64')
  const CloudFrontUrl = 'https://d2gtl62twmopm.cloudfront.net'
  const url = `${CloudFrontUrl}/${transformedRequestString})}`;

  const editUrl = `${CloudFrontUrl}/${btoa(imageRequest)}`

  const grayResponse = await fetch(editUrl, {
    method: "GET",
  });
  const greyOutputFileName = "gray.jpg";
  const outputStreamGray = fs.createWriteStream(greyOutputFileName);
  await grayResponse.body.pipe(outputStreamGray);
  const transformedGray = await grayResponse.buffer()

  s3.upload({
    Bucket: "slack-transformed-images",
    Key: `img-${Math.floor(Math.random() * 10000)}.jpg`,
    ContentType: 'image/jpeg',
    Body: transformedGray
  }, (err, data) => {
    if (err) {
      console.log("Error", err);
    } if (data) {
      console.log("Transformed Upload Success", data.Location);
    }
  })
  
  

  }
  catch (error) {
    logger.error(error);
  }
  console.log(event)
});

*/

// Listens to incoming messages that contain "goodbye"
app.message("goodbye", async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say(`See ya later, <@${message.user}> :wave:`);
  console.log(message);
});

/*
(async () => {
  // Start your app
  await app.start();

  console.log("⚡️ Bolt app is running!");
})();
*/

// Handle the Lambda function event
module.exports.handler = async (event, context, callback) => {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
};
