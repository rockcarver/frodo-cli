/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@pingidentity.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@pingidentity.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

/*
User:
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@pingidentity.com 'djt2rmn4EYZ3ypw@jfu'
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@pingidentity.com 'djt2rmn4EYZ3ypw@jfu' --json
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@pingidentity.com 'djt2rmn4EYZ3ypw@jfu' --scriptFriendly
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@pingidentity.com 'djt2rmn4EYZ3ypw@jfu' -s

Service Account (param):
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id 8a4fce63-e7f1-452c-a984-086150f83be0 --sa-jwk-file ~/Downloads/Frodo-SA-1782747461119_privateKey.jwk
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id 8a4fce63-e7f1-452c-a984-086150f83be0 --sa-jwk-file ~/Downloads/Frodo-SA-1782747461119_privateKey.jwk --json
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id 8a4fce63-e7f1-452c-a984-086150f83be0 --sa-jwk-file ~/Downloads/Frodo-SA-1782747461119_privateKey.jwk --scriptFriendly
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id 8a4fce63-e7f1-452c-a984-086150f83be0 --sa-jwk-file ~/Downloads/Frodo-SA-1782747461119_privateKey.jwk -s

Service Account (env vars):
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=8a4fce63-e7f1-452c-a984-086150f83be0 FRODO_SA_JWK='{"d":"Y5jG4hqzRXl-HfRnhlako7Tgun-p8HGfzda7HuxHIrk-u7vzxSuwo9ffKjubuvI7iM4wLIGTSnbMF8PFjzx7HH_W1OeIAae0N4JOQFTx91CPwnZ2KPI49ItxAADAxZNjphGCiTrrIKIg2Kq06YTa5eGqjUgYrFTrT0gbQMg6J6hL-s4DbWeidlkoHqYAfK8LNb75V07VgI02eYHi2IvwMwFB7fAoaZHaSd8Vh8TNlRUgIb4G2mdJA2TFV3Ihrc9ppOmD2Hc-_VouZ92q9iSZdswR9bOTfWL2EvrZ4unHcI_wk6MRn5yfRBBfWSS4jk5-uM-vXQXVGqMzkDHaKt3nb0dIm6fcK4Bkhn19KYXtkVWeA6tqXheiSdXixV48IdH0lyk4UpKl00bhNkC_JAjVSpCKyXbYxns1_3fPK_JK0-lrlQunAvuJuPgdcoTheSsboWU9DmVS8lL9MbV9pDEOWrOwI6Z6VCNYqT4CBRKC7O8p68OFUYz2XlRbdriV_j2Fo02rbDcD1Za_9l6nPWq6-igon6VowOPoe4Q0HY3spnJvnSl9DtWFncEJ6g6CHJ8FPpw_qsknZnCNew-XZYWXfzlS8yQbdX52GGSN6pFuzVrSN8bEOIKnx2ojz526-JMVg0nfF4s9Jj4sVfEiz3Mi9TVhlLQVwsrT5LfokbSdxjk","dp":"wzkNVsFuQwZh6LAG_UjFRnmHCvZmRfTg1WyNL_JCPkJfsLLU95cWpYypSY5rwmtfB0Cvnwh64qFBHnMJoWPXiSfG1JhLBScwd7LdpCjRZVcLhgbLGh46SCrSJIIxXZ4UhobU_BrPwdCRjRNDVHbPx207gmrDhmvsx4LsgY_PquvCuItvtwsdnHBk63o43Cr4DzpQnD8hBf94pKStAx4lfUlTPIcGCWKLDXBZlSczUN2j_DyddG_JArkAJTT2fuJoULpps1_NXijUClosDqzJA6bc4IyXX4HBc4PZEe5kQmOIBechxQs6gn-dAkqLncm7wKPNiavsukSMeiEraIlAGQ","dq":"tE-opri6oArh1bJ3Hkd5JMCnGrbpc219IvE5vRTiJAWOENRtEaMcGdP9s5vXBlaililfBItUrLDVOvGkNZh3MsDxKYThLN8biml9LyPhg-IOntKySB9ZJ8Gsyd8EK-pEYhnF8Hlb2NCa2ezQNNqoH_LSpS9SGmwCUiSCThZvnxrEHRjE894551zsUc8kek2dehDALZxzGoXFTbaxfMU3m9bQp98ExLovbORL-fN2xodk4QrRugIGZaddbkOjX1RVM20plhuznPSVUNO7bS6ziwRyG4tJslSYZIDmR2WT4a9z91luNT55P81W_404IMogTvavWfgdybaWd6YDsu09FQ","e":"AQAB","kty":"RSA","n":"yKUN7H0d7KPBv-CQ4Sxg89WOcvMsLNX31dcsfIDWKbPQJYq8WD32GsiCfU8TB0RaQNU78SQLMMFCMGswsv7Ne59QBFS6Xrhugpxeb8LjrzPEzKqYcnxLdPPhsucOdmELwaMXi_yOWh8GSDKAd9Dp1YSi7vDGyCL35GvgY16PlxMJcqjWawHWIJl4fz9aU0LmZUV7jdlwX2Ww8V6wqUZUb-WpNAVKehAPY-JL6_uuuZpYm3OJqjfH5bL5JseZCaUAxxYpdpJDJ0XnrScS2XLkfvms096IjDf6WXEbt73SbnznDhBGl8rzvbjRTcDMoCH401tUF8pZH5wDqY8eKChXJSMTmDirX1VaTMK1R42epSb9OKJ4qkDLZx6z8BcA3L9qiq-mzIBnLsGqQ552fTowl67KgQKUTM9q21vMH-iXQTvx29b-y3aW6LiX1A7u3xMjlcIIfRrFzV-JXy6zFeJdcxKAubN0s9bpbVB2XOQd_EFbuAtnBTy1jebl0YPtAofg9bW_LkhD_mP1Q3f6Q0VAomwFERaVTWX2U_HcZK_oDEzj9GIx9NHIjIKs8rtVpD2QS91zXmLU3FgZM7SDP0DECJMqiLQPzEv9Y6AuMiB9rEYx8FBrRbzVuPadhu5dbkBVK-DAD1AIy8WAODMbtRa3Hu8u8LICSa2SDtnfookwfp8","p":"5KlzxGNFCc7IlazPnQbVXBAJ5zMR-lT5uotrnf7GUmv1MrggJdQdd7fHVOuT04GQg0EF7HbNEZCqDV6hcePGWy6Uq6RKo232__u0k6oQtaiSENaj4ZJHGfqVlKzFTZI2ZxieBmCClL5UCXJzwx9DkGeY9p4MPVxphXtq_rA3rzK5b-E4AhALPB1OZYoiK33hYhmckqUzURlRYX3Emljv1T5GwFPB6ATjbWfZe617i9jzC_6ZOwWl3pnAVN39nGs46r33lJ29h8NJf3j3p205Va40rUyx4wsw389Ns2X8-YjAiKsmcAjbDa9osgfjKLZb5DLZsFnslVxkTVkONHHamQ","q":"4KIX9D_kZtfmisBSnXMCRNGzYYCoYzrRUG7b7pdXFUi0NBAReHZ-pZfWiWAQrEv_ZoO_ezfSuTOkOCIFgUh7xu2OWmhUGWxbQu_e82G_vk1PPQpU8Qd9nbGYhPe1OlwNuZWfF6gnaJ6LZ4t9eQVeFFsScY01bnKTytCOHElzlWszxImNi9N9ubRbDaIIKb5_Zl6125pG6F0LRxj640DA8mBRSAfFE6otcoYQFuN_EguZOXhlyfZxxihAB6K6vyFCYsKA-X68_kw35GcwCRTNaGwi19b-CDm_cDwBjwWSxpVY2CG9wKmnU5FuK0rQXjlKzSQ_CEerrz1YpZhS43Vd9w","qi":"4neo4KrdgukK5uKJJxLl9JealzEGvNtE_KWQcoYvTVFzMENK1CZNvHDNpOyIQlQXoygS13nwLJnT0nH_mcc2WoCzm4NpLAs5kAXlXehprN_OChFQNJuwmH6qmF1PATKkpAZhQYsO8vbUJx1tuQ8TT86ckIhuZ8pYc8POFWicViaNh6ZalEu-46ywQJaEn3uyPpYfmuK0JsNPOhH2npSmx6CuiQJPishPV0bAnGFpqHGt0R-hI5KDLHVJCg1VWiwxkT2sM_glXdmi-zEAvedtBkLlNEeeDoLy0K-a7i3Ze9-MI1D1unQjZUtL2NvMORRQ997cmVLQ6qDE_rscv9dclQ"}' frodo info
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=8a4fce63-e7f1-452c-a984-086150f83be0 FRODO_SA_JWK='{"d":"Y5jG4hqzRXl-HfRnhlako7Tgun-p8HGfzda7HuxHIrk-u7vzxSuwo9ffKjubuvI7iM4wLIGTSnbMF8PFjzx7HH_W1OeIAae0N4JOQFTx91CPwnZ2KPI49ItxAADAxZNjphGCiTrrIKIg2Kq06YTa5eGqjUgYrFTrT0gbQMg6J6hL-s4DbWeidlkoHqYAfK8LNb75V07VgI02eYHi2IvwMwFB7fAoaZHaSd8Vh8TNlRUgIb4G2mdJA2TFV3Ihrc9ppOmD2Hc-_VouZ92q9iSZdswR9bOTfWL2EvrZ4unHcI_wk6MRn5yfRBBfWSS4jk5-uM-vXQXVGqMzkDHaKt3nb0dIm6fcK4Bkhn19KYXtkVWeA6tqXheiSdXixV48IdH0lyk4UpKl00bhNkC_JAjVSpCKyXbYxns1_3fPK_JK0-lrlQunAvuJuPgdcoTheSsboWU9DmVS8lL9MbV9pDEOWrOwI6Z6VCNYqT4CBRKC7O8p68OFUYz2XlRbdriV_j2Fo02rbDcD1Za_9l6nPWq6-igon6VowOPoe4Q0HY3spnJvnSl9DtWFncEJ6g6CHJ8FPpw_qsknZnCNew-XZYWXfzlS8yQbdX52GGSN6pFuzVrSN8bEOIKnx2ojz526-JMVg0nfF4s9Jj4sVfEiz3Mi9TVhlLQVwsrT5LfokbSdxjk","dp":"wzkNVsFuQwZh6LAG_UjFRnmHCvZmRfTg1WyNL_JCPkJfsLLU95cWpYypSY5rwmtfB0Cvnwh64qFBHnMJoWPXiSfG1JhLBScwd7LdpCjRZVcLhgbLGh46SCrSJIIxXZ4UhobU_BrPwdCRjRNDVHbPx207gmrDhmvsx4LsgY_PquvCuItvtwsdnHBk63o43Cr4DzpQnD8hBf94pKStAx4lfUlTPIcGCWKLDXBZlSczUN2j_DyddG_JArkAJTT2fuJoULpps1_NXijUClosDqzJA6bc4IyXX4HBc4PZEe5kQmOIBechxQs6gn-dAkqLncm7wKPNiavsukSMeiEraIlAGQ","dq":"tE-opri6oArh1bJ3Hkd5JMCnGrbpc219IvE5vRTiJAWOENRtEaMcGdP9s5vXBlaililfBItUrLDVOvGkNZh3MsDxKYThLN8biml9LyPhg-IOntKySB9ZJ8Gsyd8EK-pEYhnF8Hlb2NCa2ezQNNqoH_LSpS9SGmwCUiSCThZvnxrEHRjE894551zsUc8kek2dehDALZxzGoXFTbaxfMU3m9bQp98ExLovbORL-fN2xodk4QrRugIGZaddbkOjX1RVM20plhuznPSVUNO7bS6ziwRyG4tJslSYZIDmR2WT4a9z91luNT55P81W_404IMogTvavWfgdybaWd6YDsu09FQ","e":"AQAB","kty":"RSA","n":"yKUN7H0d7KPBv-CQ4Sxg89WOcvMsLNX31dcsfIDWKbPQJYq8WD32GsiCfU8TB0RaQNU78SQLMMFCMGswsv7Ne59QBFS6Xrhugpxeb8LjrzPEzKqYcnxLdPPhsucOdmELwaMXi_yOWh8GSDKAd9Dp1YSi7vDGyCL35GvgY16PlxMJcqjWawHWIJl4fz9aU0LmZUV7jdlwX2Ww8V6wqUZUb-WpNAVKehAPY-JL6_uuuZpYm3OJqjfH5bL5JseZCaUAxxYpdpJDJ0XnrScS2XLkfvms096IjDf6WXEbt73SbnznDhBGl8rzvbjRTcDMoCH401tUF8pZH5wDqY8eKChXJSMTmDirX1VaTMK1R42epSb9OKJ4qkDLZx6z8BcA3L9qiq-mzIBnLsGqQ552fTowl67KgQKUTM9q21vMH-iXQTvx29b-y3aW6LiX1A7u3xMjlcIIfRrFzV-JXy6zFeJdcxKAubN0s9bpbVB2XOQd_EFbuAtnBTy1jebl0YPtAofg9bW_LkhD_mP1Q3f6Q0VAomwFERaVTWX2U_HcZK_oDEzj9GIx9NHIjIKs8rtVpD2QS91zXmLU3FgZM7SDP0DECJMqiLQPzEv9Y6AuMiB9rEYx8FBrRbzVuPadhu5dbkBVK-DAD1AIy8WAODMbtRa3Hu8u8LICSa2SDtnfookwfp8","p":"5KlzxGNFCc7IlazPnQbVXBAJ5zMR-lT5uotrnf7GUmv1MrggJdQdd7fHVOuT04GQg0EF7HbNEZCqDV6hcePGWy6Uq6RKo232__u0k6oQtaiSENaj4ZJHGfqVlKzFTZI2ZxieBmCClL5UCXJzwx9DkGeY9p4MPVxphXtq_rA3rzK5b-E4AhALPB1OZYoiK33hYhmckqUzURlRYX3Emljv1T5GwFPB6ATjbWfZe617i9jzC_6ZOwWl3pnAVN39nGs46r33lJ29h8NJf3j3p205Va40rUyx4wsw389Ns2X8-YjAiKsmcAjbDa9osgfjKLZb5DLZsFnslVxkTVkONHHamQ","q":"4KIX9D_kZtfmisBSnXMCRNGzYYCoYzrRUG7b7pdXFUi0NBAReHZ-pZfWiWAQrEv_ZoO_ezfSuTOkOCIFgUh7xu2OWmhUGWxbQu_e82G_vk1PPQpU8Qd9nbGYhPe1OlwNuZWfF6gnaJ6LZ4t9eQVeFFsScY01bnKTytCOHElzlWszxImNi9N9ubRbDaIIKb5_Zl6125pG6F0LRxj640DA8mBRSAfFE6otcoYQFuN_EguZOXhlyfZxxihAB6K6vyFCYsKA-X68_kw35GcwCRTNaGwi19b-CDm_cDwBjwWSxpVY2CG9wKmnU5FuK0rQXjlKzSQ_CEerrz1YpZhS43Vd9w","qi":"4neo4KrdgukK5uKJJxLl9JealzEGvNtE_KWQcoYvTVFzMENK1CZNvHDNpOyIQlQXoygS13nwLJnT0nH_mcc2WoCzm4NpLAs5kAXlXehprN_OChFQNJuwmH6qmF1PATKkpAZhQYsO8vbUJx1tuQ8TT86ckIhuZ8pYc8POFWicViaNh6ZalEu-46ywQJaEn3uyPpYfmuK0JsNPOhH2npSmx6CuiQJPishPV0bAnGFpqHGt0R-hI5KDLHVJCg1VWiwxkT2sM_glXdmi-zEAvedtBkLlNEeeDoLy0K-a7i3Ze9-MI1D1unQjZUtL2NvMORRQ997cmVLQ6qDE_rscv9dclQ"}' frodo info --json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=8a4fce63-e7f1-452c-a984-086150f83be0 FRODO_SA_JWK='{"d":"Y5jG4hqzRXl-HfRnhlako7Tgun-p8HGfzda7HuxHIrk-u7vzxSuwo9ffKjubuvI7iM4wLIGTSnbMF8PFjzx7HH_W1OeIAae0N4JOQFTx91CPwnZ2KPI49ItxAADAxZNjphGCiTrrIKIg2Kq06YTa5eGqjUgYrFTrT0gbQMg6J6hL-s4DbWeidlkoHqYAfK8LNb75V07VgI02eYHi2IvwMwFB7fAoaZHaSd8Vh8TNlRUgIb4G2mdJA2TFV3Ihrc9ppOmD2Hc-_VouZ92q9iSZdswR9bOTfWL2EvrZ4unHcI_wk6MRn5yfRBBfWSS4jk5-uM-vXQXVGqMzkDHaKt3nb0dIm6fcK4Bkhn19KYXtkVWeA6tqXheiSdXixV48IdH0lyk4UpKl00bhNkC_JAjVSpCKyXbYxns1_3fPK_JK0-lrlQunAvuJuPgdcoTheSsboWU9DmVS8lL9MbV9pDEOWrOwI6Z6VCNYqT4CBRKC7O8p68OFUYz2XlRbdriV_j2Fo02rbDcD1Za_9l6nPWq6-igon6VowOPoe4Q0HY3spnJvnSl9DtWFncEJ6g6CHJ8FPpw_qsknZnCNew-XZYWXfzlS8yQbdX52GGSN6pFuzVrSN8bEOIKnx2ojz526-JMVg0nfF4s9Jj4sVfEiz3Mi9TVhlLQVwsrT5LfokbSdxjk","dp":"wzkNVsFuQwZh6LAG_UjFRnmHCvZmRfTg1WyNL_JCPkJfsLLU95cWpYypSY5rwmtfB0Cvnwh64qFBHnMJoWPXiSfG1JhLBScwd7LdpCjRZVcLhgbLGh46SCrSJIIxXZ4UhobU_BrPwdCRjRNDVHbPx207gmrDhmvsx4LsgY_PquvCuItvtwsdnHBk63o43Cr4DzpQnD8hBf94pKStAx4lfUlTPIcGCWKLDXBZlSczUN2j_DyddG_JArkAJTT2fuJoULpps1_NXijUClosDqzJA6bc4IyXX4HBc4PZEe5kQmOIBechxQs6gn-dAkqLncm7wKPNiavsukSMeiEraIlAGQ","dq":"tE-opri6oArh1bJ3Hkd5JMCnGrbpc219IvE5vRTiJAWOENRtEaMcGdP9s5vXBlaililfBItUrLDVOvGkNZh3MsDxKYThLN8biml9LyPhg-IOntKySB9ZJ8Gsyd8EK-pEYhnF8Hlb2NCa2ezQNNqoH_LSpS9SGmwCUiSCThZvnxrEHRjE894551zsUc8kek2dehDALZxzGoXFTbaxfMU3m9bQp98ExLovbORL-fN2xodk4QrRugIGZaddbkOjX1RVM20plhuznPSVUNO7bS6ziwRyG4tJslSYZIDmR2WT4a9z91luNT55P81W_404IMogTvavWfgdybaWd6YDsu09FQ","e":"AQAB","kty":"RSA","n":"yKUN7H0d7KPBv-CQ4Sxg89WOcvMsLNX31dcsfIDWKbPQJYq8WD32GsiCfU8TB0RaQNU78SQLMMFCMGswsv7Ne59QBFS6Xrhugpxeb8LjrzPEzKqYcnxLdPPhsucOdmELwaMXi_yOWh8GSDKAd9Dp1YSi7vDGyCL35GvgY16PlxMJcqjWawHWIJl4fz9aU0LmZUV7jdlwX2Ww8V6wqUZUb-WpNAVKehAPY-JL6_uuuZpYm3OJqjfH5bL5JseZCaUAxxYpdpJDJ0XnrScS2XLkfvms096IjDf6WXEbt73SbnznDhBGl8rzvbjRTcDMoCH401tUF8pZH5wDqY8eKChXJSMTmDirX1VaTMK1R42epSb9OKJ4qkDLZx6z8BcA3L9qiq-mzIBnLsGqQ552fTowl67KgQKUTM9q21vMH-iXQTvx29b-y3aW6LiX1A7u3xMjlcIIfRrFzV-JXy6zFeJdcxKAubN0s9bpbVB2XOQd_EFbuAtnBTy1jebl0YPtAofg9bW_LkhD_mP1Q3f6Q0VAomwFERaVTWX2U_HcZK_oDEzj9GIx9NHIjIKs8rtVpD2QS91zXmLU3FgZM7SDP0DECJMqiLQPzEv9Y6AuMiB9rEYx8FBrRbzVuPadhu5dbkBVK-DAD1AIy8WAODMbtRa3Hu8u8LICSa2SDtnfookwfp8","p":"5KlzxGNFCc7IlazPnQbVXBAJ5zMR-lT5uotrnf7GUmv1MrggJdQdd7fHVOuT04GQg0EF7HbNEZCqDV6hcePGWy6Uq6RKo232__u0k6oQtaiSENaj4ZJHGfqVlKzFTZI2ZxieBmCClL5UCXJzwx9DkGeY9p4MPVxphXtq_rA3rzK5b-E4AhALPB1OZYoiK33hYhmckqUzURlRYX3Emljv1T5GwFPB6ATjbWfZe617i9jzC_6ZOwWl3pnAVN39nGs46r33lJ29h8NJf3j3p205Va40rUyx4wsw389Ns2X8-YjAiKsmcAjbDa9osgfjKLZb5DLZsFnslVxkTVkONHHamQ","q":"4KIX9D_kZtfmisBSnXMCRNGzYYCoYzrRUG7b7pdXFUi0NBAReHZ-pZfWiWAQrEv_ZoO_ezfSuTOkOCIFgUh7xu2OWmhUGWxbQu_e82G_vk1PPQpU8Qd9nbGYhPe1OlwNuZWfF6gnaJ6LZ4t9eQVeFFsScY01bnKTytCOHElzlWszxImNi9N9ubRbDaIIKb5_Zl6125pG6F0LRxj640DA8mBRSAfFE6otcoYQFuN_EguZOXhlyfZxxihAB6K6vyFCYsKA-X68_kw35GcwCRTNaGwi19b-CDm_cDwBjwWSxpVY2CG9wKmnU5FuK0rQXjlKzSQ_CEerrz1YpZhS43Vd9w","qi":"4neo4KrdgukK5uKJJxLl9JealzEGvNtE_KWQcoYvTVFzMENK1CZNvHDNpOyIQlQXoygS13nwLJnT0nH_mcc2WoCzm4NpLAs5kAXlXehprN_OChFQNJuwmH6qmF1PATKkpAZhQYsO8vbUJx1tuQ8TT86ckIhuZ8pYc8POFWicViaNh6ZalEu-46ywQJaEn3uyPpYfmuK0JsNPOhH2npSmx6CuiQJPishPV0bAnGFpqHGt0R-hI5KDLHVJCg1VWiwxkT2sM_glXdmi-zEAvedtBkLlNEeeDoLy0K-a7i3Ze9-MI1D1unQjZUtL2NvMORRQ997cmVLQ6qDE_rscv9dclQ"}' frodo info --scriptFriendly
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=8a4fce63-e7f1-452c-a984-086150f83be0 FRODO_SA_JWK='{"d":"Y5jG4hqzRXl-HfRnhlako7Tgun-p8HGfzda7HuxHIrk-u7vzxSuwo9ffKjubuvI7iM4wLIGTSnbMF8PFjzx7HH_W1OeIAae0N4JOQFTx91CPwnZ2KPI49ItxAADAxZNjphGCiTrrIKIg2Kq06YTa5eGqjUgYrFTrT0gbQMg6J6hL-s4DbWeidlkoHqYAfK8LNb75V07VgI02eYHi2IvwMwFB7fAoaZHaSd8Vh8TNlRUgIb4G2mdJA2TFV3Ihrc9ppOmD2Hc-_VouZ92q9iSZdswR9bOTfWL2EvrZ4unHcI_wk6MRn5yfRBBfWSS4jk5-uM-vXQXVGqMzkDHaKt3nb0dIm6fcK4Bkhn19KYXtkVWeA6tqXheiSdXixV48IdH0lyk4UpKl00bhNkC_JAjVSpCKyXbYxns1_3fPK_JK0-lrlQunAvuJuPgdcoTheSsboWU9DmVS8lL9MbV9pDEOWrOwI6Z6VCNYqT4CBRKC7O8p68OFUYz2XlRbdriV_j2Fo02rbDcD1Za_9l6nPWq6-igon6VowOPoe4Q0HY3spnJvnSl9DtWFncEJ6g6CHJ8FPpw_qsknZnCNew-XZYWXfzlS8yQbdX52GGSN6pFuzVrSN8bEOIKnx2ojz526-JMVg0nfF4s9Jj4sVfEiz3Mi9TVhlLQVwsrT5LfokbSdxjk","dp":"wzkNVsFuQwZh6LAG_UjFRnmHCvZmRfTg1WyNL_JCPkJfsLLU95cWpYypSY5rwmtfB0Cvnwh64qFBHnMJoWPXiSfG1JhLBScwd7LdpCjRZVcLhgbLGh46SCrSJIIxXZ4UhobU_BrPwdCRjRNDVHbPx207gmrDhmvsx4LsgY_PquvCuItvtwsdnHBk63o43Cr4DzpQnD8hBf94pKStAx4lfUlTPIcGCWKLDXBZlSczUN2j_DyddG_JArkAJTT2fuJoULpps1_NXijUClosDqzJA6bc4IyXX4HBc4PZEe5kQmOIBechxQs6gn-dAkqLncm7wKPNiavsukSMeiEraIlAGQ","dq":"tE-opri6oArh1bJ3Hkd5JMCnGrbpc219IvE5vRTiJAWOENRtEaMcGdP9s5vXBlaililfBItUrLDVOvGkNZh3MsDxKYThLN8biml9LyPhg-IOntKySB9ZJ8Gsyd8EK-pEYhnF8Hlb2NCa2ezQNNqoH_LSpS9SGmwCUiSCThZvnxrEHRjE894551zsUc8kek2dehDALZxzGoXFTbaxfMU3m9bQp98ExLovbORL-fN2xodk4QrRugIGZaddbkOjX1RVM20plhuznPSVUNO7bS6ziwRyG4tJslSYZIDmR2WT4a9z91luNT55P81W_404IMogTvavWfgdybaWd6YDsu09FQ","e":"AQAB","kty":"RSA","n":"yKUN7H0d7KPBv-CQ4Sxg89WOcvMsLNX31dcsfIDWKbPQJYq8WD32GsiCfU8TB0RaQNU78SQLMMFCMGswsv7Ne59QBFS6Xrhugpxeb8LjrzPEzKqYcnxLdPPhsucOdmELwaMXi_yOWh8GSDKAd9Dp1YSi7vDGyCL35GvgY16PlxMJcqjWawHWIJl4fz9aU0LmZUV7jdlwX2Ww8V6wqUZUb-WpNAVKehAPY-JL6_uuuZpYm3OJqjfH5bL5JseZCaUAxxYpdpJDJ0XnrScS2XLkfvms096IjDf6WXEbt73SbnznDhBGl8rzvbjRTcDMoCH401tUF8pZH5wDqY8eKChXJSMTmDirX1VaTMK1R42epSb9OKJ4qkDLZx6z8BcA3L9qiq-mzIBnLsGqQ552fTowl67KgQKUTM9q21vMH-iXQTvx29b-y3aW6LiX1A7u3xMjlcIIfRrFzV-JXy6zFeJdcxKAubN0s9bpbVB2XOQd_EFbuAtnBTy1jebl0YPtAofg9bW_LkhD_mP1Q3f6Q0VAomwFERaVTWX2U_HcZK_oDEzj9GIx9NHIjIKs8rtVpD2QS91zXmLU3FgZM7SDP0DECJMqiLQPzEv9Y6AuMiB9rEYx8FBrRbzVuPadhu5dbkBVK-DAD1AIy8WAODMbtRa3Hu8u8LICSa2SDtnfookwfp8","p":"5KlzxGNFCc7IlazPnQbVXBAJ5zMR-lT5uotrnf7GUmv1MrggJdQdd7fHVOuT04GQg0EF7HbNEZCqDV6hcePGWy6Uq6RKo232__u0k6oQtaiSENaj4ZJHGfqVlKzFTZI2ZxieBmCClL5UCXJzwx9DkGeY9p4MPVxphXtq_rA3rzK5b-E4AhALPB1OZYoiK33hYhmckqUzURlRYX3Emljv1T5GwFPB6ATjbWfZe617i9jzC_6ZOwWl3pnAVN39nGs46r33lJ29h8NJf3j3p205Va40rUyx4wsw389Ns2X8-YjAiKsmcAjbDa9osgfjKLZb5DLZsFnslVxkTVkONHHamQ","q":"4KIX9D_kZtfmisBSnXMCRNGzYYCoYzrRUG7b7pdXFUi0NBAReHZ-pZfWiWAQrEv_ZoO_ezfSuTOkOCIFgUh7xu2OWmhUGWxbQu_e82G_vk1PPQpU8Qd9nbGYhPe1OlwNuZWfF6gnaJ6LZ4t9eQVeFFsScY01bnKTytCOHElzlWszxImNi9N9ubRbDaIIKb5_Zl6125pG6F0LRxj640DA8mBRSAfFE6otcoYQFuN_EguZOXhlyfZxxihAB6K6vyFCYsKA-X68_kw35GcwCRTNaGwi19b-CDm_cDwBjwWSxpVY2CG9wKmnU5FuK0rQXjlKzSQ_CEerrz1YpZhS43Vd9w","qi":"4neo4KrdgukK5uKJJxLl9JealzEGvNtE_KWQcoYvTVFzMENK1CZNvHDNpOyIQlQXoygS13nwLJnT0nH_mcc2WoCzm4NpLAs5kAXlXehprN_OChFQNJuwmH6qmF1PATKkpAZhQYsO8vbUJx1tuQ8TT86ckIhuZ8pYc8POFWicViaNh6ZalEu-46ywQJaEn3uyPpYfmuK0JsNPOhH2npSmx6CuiQJPishPV0bAnGFpqHGt0R-hI5KDLHVJCg1VWiwxkT2sM_glXdmi-zEAvedtBkLlNEeeDoLy0K-a7i3Ze9-MI1D1unQjZUtL2NvMORRQ997cmVLQ6qDE_rscv9dclQ"}' frodo info -s
 */
import cp from 'child_process';
import { promisify } from 'util';
import {getEnv, removeAnsiEscapeCodes} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import { rmSync, writeFileSync } from 'fs';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';

const jwkFile = 'test/fs_tmp/info-jwk.json';

beforeAll(() => {
  writeFileSync(jwkFile, c.saJwk);
});

afterAll(() => {
  rmSync(jwkFile);
});

describe('frodo info', () => {
  describe('Authenticate as user', () => {
    test(`frodo info <host> <user> <pass>`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass}`;
      const env = getEnv({ ...c, saId: undefined, saJwk: undefined });
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    });

    test(`frodo info <host> <user> <pass> --json`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} --json`;
      const env = getEnv({ ...c, saId: undefined, saJwk: undefined });
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info <host> <user> <pass> --scriptFriendly`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} --scriptFriendly`;
      const env = getEnv({ ...c, saId: undefined, saJwk: undefined });
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info <host> <user> <pass> -s`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} -s`;
      const env = getEnv({ ...c, saId: undefined, saJwk: undefined });
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  });

  describe('Authenticate as service account using cli args', () => {
    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file>`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile}`;
      const env = getEnv({ ...c, user: undefined, pass: undefined });
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> --json`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} --json`;
      const env = getEnv({ ...c, user: undefined, pass: undefined });
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> --scriptFriendly`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} --scriptFriendly`;
      const env = getEnv({ ...c, user: undefined, pass: undefined });
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> -s`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} -s`;
      const env = getEnv({ ...c, user: undefined, pass: undefined });
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  });

  describe('Authenticate as service account using env vars', () => {
    test(`frodo info`, async () => {
      const CMD = `frodo info`;
      const env = getEnv({ ...c, user: undefined, pass: undefined, saId: undefined, saJwk: undefined });
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    });

    test(`frodo info --json`, async () => {
      const CMD = `frodo info --json`;
      const env = getEnv({ ...c, user: undefined, pass: undefined, saId: undefined, saJwk: undefined });
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info --scriptFriendly`, async () => {
      const CMD = `frodo info --scriptFriendly`;
      const env = getEnv({ ...c, user: undefined, pass: undefined, saId: undefined, saJwk: undefined });
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info -s`, async () => {
      const CMD = `frodo info -s`;
      const env = getEnv({ ...c, user: undefined, pass: undefined, saId: undefined, saJwk: undefined });
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  });
});
